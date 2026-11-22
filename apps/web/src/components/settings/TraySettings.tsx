import type { DesktopTrayPreferences } from "@t3tools/contracts";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { m } from "~/i18n/messages";
import { useGT } from "gt-react";
import { useState } from "react";

import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

export function TraySettings() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const bridge = window.desktopBridge;
  const [preferences, setPreferences] = useState(() => bridge?.getTrayPreferences?.() ?? null);
  const [error, setError] = useState<{ key: keyof DesktopTrayPreferences; message: string }>();
  const save = bridge?.setTrayPreferences;
  if (!save || preferences === null) return null;

  const update = async (key: keyof DesktopTrayPreferences, value: boolean) => {
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    setError(undefined);
    try {
      await save({ [key]: value });
    } catch (cause) {
      setPreferences(previous);
      setError({
        key,
        message:
          cause instanceof Error
            ? (thrownErrorMessage(cause, m) ?? cause.message)
            : gt("Couldn't change this setting."),
      });
    }
  };
  const errorFor = (key: keyof DesktopTrayPreferences) =>
    error?.key === key ? error.message : undefined;

  return (
    <>
      <SettingsRow
        {...searchableSetting("close-to-tray")}
        description={
          errorFor("closeToTray") ??
          (preferences.closeToTray
            ? gt(
                "Closing the window keeps T3 Code and its agents running, so other devices can still reach them.",
              )
            : gt("Closing the window quits T3 Code."))
        }
        control={
          <Switch
            checked={preferences.closeToTray}
            onCheckedChange={(checked) => void update("closeToTray", checked)}
            aria-label={gt("Keep running in the tray")}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("launch-at-login")}
        description={
          errorFor("launchAtLogin") ??
          (preferences.closeToTray
            ? gt("Starts in the tray when you sign in to Windows.")
            : gt("Opens T3 Code when you sign in to Windows."))
        }
        control={
          <Switch
            checked={preferences.launchAtLogin}
            onCheckedChange={(checked) => void update("launchAtLogin", checked)}
            aria-label={gt("Start at sign-in")}
          />
        }
      />
    </>
  );
}
