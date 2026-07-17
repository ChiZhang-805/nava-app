export const appConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
  upstreamRepo: import.meta.env.VITE_WEB_UPSTREAM_REPO ?? "https://github.com/Tj-jiaoao/style-muse-next.git",
};

export function assertConfig() {
  if (!appConfig.supabaseUrl || !appConfig.supabaseKey) {
    return "缺少 Supabase 配置。请在 .env 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。";
  }
  try {
    const url = new URL(appConfig.supabaseUrl);
    if (!url.hostname.endsWith(".supabase.co")) return "VITE_SUPABASE_URL 看起来不是 Supabase 项目地址。";
  } catch {
    return "VITE_SUPABASE_URL 不是有效 URL。";
  }
  return null;
}
