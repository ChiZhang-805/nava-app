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
  void input;
  // Origin headers are not authentication. Public review AI is intentionally
  // disabled; the app uses a local deterministic demo reply instead.
  return false;
}
