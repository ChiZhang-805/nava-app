export function resolveConsentFlag(explicitValue: unknown, legacyValue: unknown) {
  if (typeof explicitValue === "boolean") return explicitValue;
  return legacyValue === true;
}

export function onboardingAnswers(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
