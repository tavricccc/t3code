import { describe, expect, it } from "vite-plus/test";

import {
  SYSTEM_LANGUAGE,
  nativeLanguageName,
  resolveLocale,
  resolveLocaleSelection,
} from "./locales.ts";

describe("locales", () => {
  it("returns native names for Simplified and Traditional Chinese", () => {
    expect(nativeLanguageName("zh")).toBe("中文（简体）");
    expect(nativeLanguageName("zh-TW")).toBe("中文（繁體）");
  });

  it("maps Traditional Chinese system tags to zh-TW when supported and never to Simplified zh", () => {
    const withTraditional = ["en", "zh", "zh-TW"];
    const simplifiedOnly = ["en", "zh"];

    expect(resolveLocale(SYSTEM_LANGUAGE, ["zh-TW"], withTraditional, "en")).toBe("zh-TW");
    expect(resolveLocale(SYSTEM_LANGUAGE, ["zh-Hant-TW"], withTraditional, "en")).toBe("zh-TW");
    expect(resolveLocale(SYSTEM_LANGUAGE, ["zh-HK"], withTraditional, "en")).toBe("zh-TW");
    expect(resolveLocale(SYSTEM_LANGUAGE, ["zh-CN"], withTraditional, "en")).toBe("zh");
    expect(resolveLocale(SYSTEM_LANGUAGE, ["zh-Hant-TW"], simplifiedOnly, "en")).toBe("en");

    expect(resolveLocaleSelection(SYSTEM_LANGUAGE, ["zh-Hant-HK"], withTraditional, "en")).toEqual({
      catalogLocale: "zh-TW",
      formattingLocale: "zh-Hant-HK",
    });
  });
});
