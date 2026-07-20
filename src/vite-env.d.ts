/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_ENABLE_REVIEW_DEMO?: string;
  readonly VITE_WEB_UPSTREAM_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
