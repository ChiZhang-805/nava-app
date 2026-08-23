export function isReviewOriginAllowed(origin: string, configuredOrigins: string) {
  if (!origin || !configuredOrigins.trim()) return false;

  return configuredOrigins
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .some((allowedOrigin) => {
      if (origin === allowedOrigin) return true;
      const localOrigin = allowedOrigin === "http://127.0.0.1" || allowedOrigin === "http://localhost";
      return localOrigin && origin.startsWith(`${allowedOrigin}:`);
    });
}

export function canUseReviewAi(input: {
  requested: boolean;
  enabled: string | undefined;
  origin: string;
  configuredOrigins: string | undefined;
}) {
  return input.requested
    && input.enabled === "true"
    && isReviewOriginAllowed(input.origin, input.configuredOrigins ?? "");
}
