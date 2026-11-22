#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/cli";

const FORK_REVISION_MULTIPLIER = 100;
const MAX_FORK_REVISION = 99;
const MAX_WINDOWS_VERSION_COMPONENT = 65535;
const STABLE_SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

export interface ForkReleaseMetadata {
  readonly upstreamVersion: string;
  readonly revision: number;
  readonly version: string;
  readonly tag: string;
  readonly releaseName: string;
}

export class InvalidForkUpstreamVersionError extends Schema.TaggedError<InvalidForkUpstreamVersionError>()(
  "InvalidForkUpstreamVersionError",
  {
    version: Schema.String,
  },
) {
  override get message(): string {
    return `Invalid upstream stable version '${this.version}'. Expected X.Y.Z.`;
  }
}

export class InvalidForkRevisionError extends Schema.TaggedError<InvalidForkRevisionError>()(
  "InvalidForkRevisionError",
  {
    revision: Schema.Number,
  },
) {
  override get message(): string {
    return `Invalid fork revision '${this.revision}'. Expected an integer between 1 and ${MAX_FORK_REVISION}.`;
  }
}

export class ForkVersionOverflowError extends Schema.TaggedError<ForkVersionOverflowError>()(
  "ForkVersionOverflowError",
  {
    upstreamVersion: Schema.String,
    computedPatch: Schema.Number,
  },
) {
  override get message(): string {
    return `Computed fork patch ${this.computedPatch} for '${this.upstreamVersion}' exceeds the Windows installer limit (${MAX_WINDOWS_VERSION_COMPONENT}).`;
  }
}

const DesktopPackageJsonSchema = Schema.Struct({
  version: Schema.NonEmptyString,
});
const decodeDesktopPackageJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(DesktopPackageJsonSchema),
);
const RepoRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("..", import.meta.url))),
);

export function parseUpstreamStableVersion(
  raw: string,
): Effect.Effect<
  {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
    readonly normalized: string;
  },
  InvalidForkUpstreamVersionError
> {
  const match = STABLE_SEMVER_PATTERN.exec(raw.trim());
  if (!match) {
    return Effect.fail(new InvalidForkUpstreamVersionError({ version: raw }));
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return Effect.succeed({
    major,
    minor,
    patch,
    normalized: `${major}.${minor}.${patch}`,
  });
}

export const findHighestForkRevisionForUpstream = Effect.fn("findHighestForkRevisionForUpstream")(
  function* (upstreamVersion: string, existingTags: ReadonlyArray<string>) {
    const { major, minor, patch } = yield* parseUpstreamStableVersion(upstreamVersion);
    let highest = 0;
    for (const rawTag of existingTags) {
      const match = STABLE_SEMVER_PATTERN.exec(rawTag.trim());
      if (!match) continue;
      if (Number(match[1]) !== major || Number(match[2]) !== minor) continue;
      const tagPatch = Number(match[3]);
      if (Math.floor(tagPatch / FORK_REVISION_MULTIPLIER) !== patch) continue;
      const revision = tagPatch % FORK_REVISION_MULTIPLIER;
      if (revision >= 1 && revision <= MAX_FORK_REVISION && revision > highest) {
        highest = revision;
      }
    }
    return highest;
  },
);

/**
 * Encodes an upstream stable `X.Y.Z` plus a fork revision `r` (1..99) into plain 3-part SemVer
 * `X.Y.(Z * 100 + r)` so electron-updater's Stable (`latest.yml`) channel treats every upstream
 * bump and every intermediate fork revision as strictly increasing.
 */
export const resolveForkReleaseMetadata = Effect.fn("resolveForkReleaseMetadata")(
  function* (input: {
    readonly upstreamVersion: string;
    readonly existingTags?: ReadonlyArray<string> | undefined;
    readonly revision?: number | undefined;
  }) {
    const parsed = yield* parseUpstreamStableVersion(input.upstreamVersion);
    const highest = yield* findHighestForkRevisionForUpstream(
      parsed.normalized,
      input.existingTags ?? [],
    );
    const revision = input.revision ?? highest + 1;
    if (!Number.isInteger(revision) || revision < 1 || revision > MAX_FORK_REVISION) {
      return yield* new InvalidForkRevisionError({ revision });
    }
    const computedPatch = parsed.patch * FORK_REVISION_MULTIPLIER + revision;
    if (computedPatch > MAX_WINDOWS_VERSION_COMPONENT) {
      return yield* new ForkVersionOverflowError({
        upstreamVersion: parsed.normalized,
        computedPatch,
      });
    }
    const version = `${parsed.major}.${parsed.minor}.${computedPatch}`;
    return {
      upstreamVersion: parsed.normalized,
      revision,
      version,
      tag: `v${version}`,
      releaseName: `T3 Code v${parsed.normalized} (Fork r${revision})`,
    } satisfies ForkReleaseMetadata;
  },
);

const readDesktopVersion = Effect.fn("readDesktopVersion")(function* (rootDir: string | undefined) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = rootDir ? path.resolve(rootDir) : yield* RepoRoot;
  const source = yield* fs.readFileString(path.join(workspaceRoot, "apps/desktop/package.json"));
  const decoded = yield* decodeDesktopPackageJson(source);
  return decoded.version.replace(/[-+].*$/, "");
});

const parseTagList = (raw: string | undefined): ReadonlyArray<string> =>
  (raw ?? "")
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const writeOutput = Effect.fn("writeForkReleaseOutput")(function* (
  metadata: ForkReleaseMetadata,
  githubOutput: boolean,
) {
  const entries = [
    ["upstream_version", metadata.upstreamVersion],
    ["revision", String(metadata.revision)],
    ["version", metadata.version],
    ["tag", metadata.tag],
    ["release_name", metadata.releaseName],
  ] as const;

  if (githubOutput) {
    const fs = yield* FileSystem.FileSystem;
    const outputPath = yield* Config.NonEmptyString("GITHUB_OUTPUT");
    const serialized = entries.map(([key, value]) => `${key}=${value}\n`).join("");
    yield* fs.writeFileString(outputPath, serialized, { flag: "a" });
    return;
  }

  for (const [key, value] of entries) {
    yield* Console.log(`${key}=${value}`);
  }
});

const RevisionSchema = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(MAX_FORK_REVISION),
);

const command = Command.make(
  "resolve-fork-version",
  {
    upstreamVersion: Flag.String("upstream-version").pipe(
      Flag.withDescription(
        "Upstream stable version (X.Y.Z or vX.Y.Z). Defaults to apps/desktop/package.json.",
      ),
      Flag.optional,
    ),
    existingTags: Flag.String("existing-tags").pipe(
      Flag.withDescription("Comma- or newline-separated existing fork release tags."),
      Flag.optional,
    ),
    revision: Flag.String("revision").pipe(
      Flag.withSchema(RevisionSchema),
      Flag.withDescription("Explicit fork revision (1..99)."),
      Flag.optional,
    ),
    root: Flag.String("root").pipe(
      Flag.withDescription("Workspace root used when reading apps/desktop/package.json."),
      Flag.optional,
    ),
    githubOutput: Flag.Boolean("github-output").pipe(
      Flag.withDescription("Append resolved values to GITHUB_OUTPUT."),
      Flag.withDefault(false),
    ),
  },
  ({ upstreamVersion, existingTags, revision, root, githubOutput }) =>
    Effect.gen(function* () {
      const resolvedUpstream = Option.isSome(upstreamVersion)
        ? upstreamVersion.value
        : yield* readDesktopVersion(Option.getOrUndefined(root));
      const metadata = yield* resolveForkReleaseMetadata({
        upstreamVersion: resolvedUpstream,
        existingTags: parseTagList(Option.getOrUndefined(existingTags)),
        revision: Option.getOrUndefined(revision),
      });
      yield* writeOutput(metadata, githubOutput);
    }),
).pipe(Command.withDescription("Resolve a monotonic SemVer fork release version."));

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
