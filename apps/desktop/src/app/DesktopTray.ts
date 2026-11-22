// @effect-diagnostics nodeBuiltinImport:off - Reads the server's run projection to warn before a quit stops agents.
import * as NodeSqlite from "node:sqlite";

import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Electron from "electron";
import { msg } from "gt-i18n";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import { m, onLocaleChange } from "../i18n/messages.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopAssets from "./DesktopAssets.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";
import * as DesktopState from "./DesktopState.ts";

/** The sign-in launch passes this so the app starts in the tray instead of opening a window. */
export const LAUNCH_IN_BACKGROUND_ARG = "--t3-background";

export const traySupported = (platform: NodeJS.Platform) => platform === "win32";

export const startsInBackground = (input: {
  readonly platform: NodeJS.Platform;
  readonly args: ReadonlyArray<string>;
  readonly settings: DesktopAppSettings.DesktopSettings;
}) =>
  traySupported(input.platform) &&
  input.settings.closeToTray &&
  input.args.includes(LAUNCH_IN_BACKGROUND_ARG);

/**
 * Threads with a run in flight, by the query the server's KeepAwake uses. The desktop and its
 * server ship in one bundle, so the schema matches. Anything unreadable counts as none.
 */
export function countRunningThreads(databasePath: string): number {
  try {
    const db = new NodeSqlite.DatabaseSync(databasePath, { readOnly: true });
    try {
      db.exec("PRAGMA busy_timeout = 1000");
      const row = db
        .prepare(
          `SELECT COUNT(DISTINCT thread_id) AS count FROM orchestration_v2_projection_runs
           WHERE status IN ('preparing', 'starting', 'running')`,
        )
        .get();
      return Number(row?.count ?? 0);
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

const { logInfo: logTrayInfo, logWarning: logTrayWarning } = makeComponentLogger("desktop-tray");

export class DesktopTray extends Context.Service<
  DesktopTray,
  {
    /** Matches the tray icon and the sign-in launch to the saved preferences. */
    readonly configure: Effect.Effect<void>;
  }
>()("@t3tools/desktop/app/DesktopTray") {}

/** @public */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const assets = yield* DesktopAssets.DesktopAssets;
  const desktopSettings = yield* DesktopAppSettings.DesktopAppSettings;
  const state = yield* DesktopState.DesktopState;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const electronApp = yield* ElectronApp.ElectronApp;
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const executablePath = yield* HostProcess.ExecutablePath;
  const runFork = Effect.runForkWith(yield* Effect.context<never>());

  let tray: Electron.Tray | undefined;
  let stopLocaleUpdates: (() => void) | undefined;

  const open = desktopWindow.activate.pipe(
    Effect.catch((error) =>
      logTrayWarning("could not open the window from the tray", { message: error.message }),
    ),
    Effect.withSpan("desktop.tray.open"),
  );

  const runningLocalThreads = Effect.gen(function* () {
    const settings = yield* desktopSettings.get;
    // A WSL-only backend keeps its database inside WSL, and a disabled one runs nothing here.
    if (!settings.localEnvironmentEnabled || (settings.wslOnly && settings.wslBackendEnabled)) {
      return 0;
    }
    const databasePath = environment.path.join(environment.stateDir, "statev2.sqlite");
    return yield* Effect.sync(() => countRunningThreads(databasePath));
  });

  const quit = Effect.gen(function* () {
    const running = yield* runningLocalThreads;
    if (running > 0) {
      const { response } = yield* electronDialog.showMessageBox({
        type: "warning",
        title: environment.displayName,
        message:
          running === 1
            ? m(msg("An agent is still running."))
            : m(msg("{count} agents are still running."), { count: String(running) }),
        detail: m(msg("Quitting {name} stops them."), { name: environment.displayName }),
        buttons: [m(msg("Quit", { $context: "button, quits the app" })), m(msg("Cancel"))],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return;
    }
    yield* electronApp.quit;
  }).pipe(
    Effect.catch((error) =>
      logTrayWarning("could not confirm quitting from the tray", { message: error.message }),
    ),
    Effect.withSpan("desktop.tray.quit"),
  );

  const buildMenu = () =>
    Electron.Menu.buildFromTemplate([
      {
        label: m(msg("Open {name}"), { name: environment.displayName }),
        click: () => void runFork(open),
      },
      { type: "separator" },
      {
        label: m(msg("Quit {name}"), { name: environment.displayName }),
        click: () => void runFork(quit),
      },
    ]);

  const showTray = Effect.gen(function* () {
    const iconPaths = yield* assets.iconPaths;
    const icon = Option.orElse(iconPaths.ico, () => iconPaths.png);
    if (Option.isNone(icon)) {
      yield* logTrayWarning("no icon for the tray; closing the window will quit");
      return;
    }
    yield* Effect.sync(() => {
      const created = new Electron.Tray(icon.value);
      created.setToolTip(environment.displayName);
      created.setContextMenu(buildMenu());
      created.on("click", () => void runFork(open));
      tray = created;
      stopLocaleUpdates = onLocaleChange(() => tray?.setContextMenu(buildMenu()));
    });
    yield* logTrayInfo("tray shown");
  });

  const hideTray = Effect.sync(() => {
    stopLocaleUpdates?.();
    stopLocaleUpdates = undefined;
    tray?.destroy();
    tray = undefined;
  });

  // An unpackaged build would register the bare Electron binary.
  const syncLoginItem = (launchAtLogin: boolean) =>
    environment.isPackaged
      ? Effect.sync(() =>
          Electron.app.setLoginItemSettings({
            openAtLogin: launchAtLogin,
            name: environment.appUserModelId,
            path: executablePath,
            args: [LAUNCH_IN_BACKGROUND_ARG],
          }),
        )
      : Effect.void;

  yield* Effect.addFinalizer(() => hideTray);

  return DesktopTray.of({
    configure: Effect.gen(function* () {
      if (!traySupported(environment.platform)) return;
      const settings = yield* desktopSettings.get;
      yield* syncLoginItem(settings.launchAtLogin);
      if (settings.closeToTray && tray === undefined) yield* showTray;
      if (!settings.closeToTray && tray !== undefined) yield* hideTray;
      yield* Ref.set(state.runsInTray, tray !== undefined);
    }).pipe(Effect.withSpan("desktop.tray.configure")),
  });
});

export const layer = Layer.effect(DesktopTray, make);
