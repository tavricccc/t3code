import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as DesktopTray from "../../app/DesktopTray.ts";
import * as DesktopAppSettings from "../../settings/DesktopAppSettings.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod, makeSyncIpcMethod } from "../DesktopIpc.ts";

const TrayPreferences = Schema.Struct({
  closeToTray: Schema.Boolean,
  launchAtLogin: Schema.Boolean,
});

export const getTrayPreferences = makeSyncIpcMethod({
  channel: IpcChannels.GET_TRAY_PREFERENCES_CHANNEL,
  result: Schema.NullOr(TrayPreferences),
  handler: Effect.fn("desktop.ipc.tray.getPreferences")(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    if (!DesktopTray.traySupported(environment.platform)) return null;
    const { closeToTray, launchAtLogin } = yield* (yield* DesktopAppSettings.DesktopAppSettings)
      .get;
    return { closeToTray, launchAtLogin };
  }),
});

export const setTrayPreferences = makeIpcMethod({
  channel: IpcChannels.SET_TRAY_PREFERENCES_CHANNEL,
  payload: Schema.Struct({
    closeToTray: Schema.optionalKey(Schema.Boolean),
    launchAtLogin: Schema.optionalKey(Schema.Boolean),
  }),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.tray.setPreferences")(function* (preferences) {
    const change = yield* (yield* DesktopAppSettings.DesktopAppSettings).setTrayPreferences(
      preferences,
    );
    if (change.changed) yield* (yield* DesktopTray.DesktopTray).configure;
  }),
});
