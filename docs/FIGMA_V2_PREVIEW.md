# NAVA Figma v2 public build

The public site is a static frontend build connected to the Web team's shared Supabase project through its public URL and publishable key. Authentication and data access are governed by Supabase Auth and RLS.

## Build

```powershell
npm run build:pages
```

The generated `dist` directory is ready for GitHub Pages. It includes `404.html` for direct page recovery and `.nojekyll` for static asset delivery.

The site opens on the static Figma splash screen. Tap anywhere to continue to sign-in. Accounts must exist in the shared Supabase Auth project. Existing users without a known password should use the eight-digit email-code reset-password flow to set one; SMS codes remain six digits.

## Splash provenance

- Figma file: `kLAU3srtj2uKT5qJBX2VEy`
- Figma frame: `1567:1763` (`首页开屏`)
- Background layer: `1567:1764` (`image 19`)
- Gradient layer: `1567:1765` (`渐变背景`)
- `launch-background-source.jpg` is the compressed Figma source texture. The splash applies the frame's vertical flip, crop offsets, scale, and `lighten` gradient overlay in CSS, while keeping branding and UI text as accessible HTML.

## Boundaries

- The private `nava-app` repository remains the source of truth.
- The public repository contains compiled static files only.
- No `.env`, service-role key, JWT secret, personal token, or production dataset may be published.
- The Supabase project URL and publishable client key are public client configuration; authorization still depends on Auth and RLS.
- Figma is a read-only design reference; implementation changes belong in the App repository.
