// @effect-diagnostics nodeBuiltinImport:off - Seeds the SQLite file the tray reads the same way the server writes it.
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopTray from "./DesktopTray.ts";

const settings = DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS;
const signInArgs = ["T3 Code.exe", DesktopTray.LAUNCH_IN_BACKGROUND_ARG];

describe("DesktopTray", () => {
  it.each([
    {
      name: "a Windows sign-in launch",
      platform: "win32",
      args: signInArgs,
      settings,
      hidden: true,
    },
    {
      name: "a Windows launch by hand",
      platform: "win32",
      args: ["T3 Code.exe"],
      settings,
      hidden: false,
    },
    {
      name: "a sign-in launch with the tray off",
      platform: "win32",
      args: signInArgs,
      settings: { ...settings, closeToTray: false },
      hidden: false,
    },
    { name: "another platform", platform: "darwin", args: signInArgs, settings, hidden: false },
  ] as const)("starts in the background only for $name", (input) => {
    assert.equal(DesktopTray.startsInBackground(input), input.hidden);
  });

  it.effect("counts threads with a run in flight and reads a missing database as none", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-desktop-tray-" });
      const databasePath = path.join(directory, "statev2.sqlite");
      assert.equal(DesktopTray.countRunningThreads(databasePath), 0);

      const db = new NodeSqlite.DatabaseSync(databasePath);
      db.exec(`CREATE TABLE orchestration_v2_projection_runs (thread_id TEXT, status TEXT)`);
      const insert = db.prepare(
        `INSERT INTO orchestration_v2_projection_runs (thread_id, status) VALUES (?, ?)`,
      );
      const runs = [
        ["a", "completed"],
        ["a", "running"],
        ["b", "preparing"],
        ["b", "starting"],
        ["c", "interrupted"],
      ] as const;
      for (const [threadId, status] of runs) insert.run(threadId, status);
      db.close();

      assert.equal(DesktopTray.countRunningThreads(databasePath), 2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
