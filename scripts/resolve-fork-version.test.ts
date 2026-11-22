import { assert, it } from "@effect/vitest";
import { compareSemverVersions } from "@t3tools/shared/semver";
import * as Effect from "effect/Effect";

import {
  InvalidForkRevisionError,
  InvalidForkUpstreamVersionError,
  findHighestForkRevisionForUpstream,
  resolveForkReleaseMetadata,
} from "./resolve-fork-version.ts";

it.effect("encodes the first fork revision monotonically above the upstream release", () =>
  Effect.gen(function* () {
    const first = yield* resolveForkReleaseMetadata({
      upstreamVersion: "v0.1.11",
      existingTags: ["v0.1.11"],
    });

    assert.deepStrictEqual(first, {
      upstreamVersion: "0.1.11",
      revision: 1,
      version: "0.1.1101",
      tag: "v0.1.1101",
      releaseName: "T3 Code v0.1.11 (Fork r1)",
    });
    assert.isAbove(compareSemverVersions(first.version, "0.1.11"), 0);
  }),
);

it.effect(
  "increments the fork revision per upstream release and stays monotonic across upgrades",
  () =>
    Effect.gen(function* () {
      const tags = ["v0.1.11", "v0.1.1101", "v0.1.1102", "v0.1.1003"];
      assert.equal(yield* findHighestForkRevisionForUpstream("0.1.11", tags), 2);

      const third = yield* resolveForkReleaseMetadata({
        upstreamVersion: "0.1.11",
        existingTags: tags,
      });
      const nextUpstream = yield* resolveForkReleaseMetadata({
        upstreamVersion: "v0.1.12",
        existingTags: [...tags, third.tag],
      });
      const nextMinor = yield* resolveForkReleaseMetadata({
        upstreamVersion: "v0.2.0",
        existingTags: [...tags, third.tag, nextUpstream.tag],
      });

      assert.equal(third.version, "0.1.1103");
      assert.equal(nextUpstream.version, "0.1.1201");
      assert.equal(nextMinor.version, "0.2.1");
      assert.isAbove(compareSemverVersions(third.version, "0.1.1102"), 0);
      assert.isAbove(compareSemverVersions(nextUpstream.version, third.version), 0);
      assert.isAbove(compareSemverVersions(nextMinor.version, nextUpstream.version), 0);
    }),
);

it.effect("rejects invalid upstream versions and out-of-range revisions", () =>
  Effect.gen(function* () {
    const badVersion = yield* Effect.flip(
      resolveForkReleaseMetadata({ upstreamVersion: "0.1.12-nightly.20261122.1" }),
    );
    const badRevision = yield* Effect.flip(
      resolveForkReleaseMetadata({ upstreamVersion: "0.1.11", revision: 100 }),
    );

    assert.instanceOf(badVersion, InvalidForkUpstreamVersionError);
    assert.instanceOf(badRevision, InvalidForkRevisionError);
  }),
);
