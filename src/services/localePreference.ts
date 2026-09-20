export type AppLocale = "zh" | "en";
export type LocalePreference = AppLocale | "system";
export const LOCALE_STORAGE_KEY = "nava.locale";

/** Match the device's ordered language preferences; English is the unsupported-language fallback. */
export function deviceLocale(languages: readonly string[]): AppLocale {
  for (const tag of languages) {
    const language = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (language === "zh" || language === "en") return language;
  }
  return "en";
}

export function localePreference(value: string | null): LocalePreference {
  return value === "zh" || value === "en" ? value : "system";
}
