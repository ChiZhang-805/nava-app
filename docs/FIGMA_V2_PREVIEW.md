# NAVA Figma v2 preview

The public review site is a static demonstration build. It does not connect to the shared production Supabase project and cannot modify team data.

## Build

```powershell
npm run build:review
```

The generated `dist` directory is ready for GitHub Pages. It includes `404.html` for direct page recovery and `.nojekyll` for static asset delivery.

## Demo sign-in

- Account: `13800138000`
- Password: `12345678`

The preview opens on the static Figma splash screen. Tap anywhere to continue to sign-in. The former animated quotes, interactive bubble, quote fragments, and energy interaction are not part of this review build.

## Splash provenance

- Figma file: `kLAU3srtj2uKT5qJBX2VEy`
- Figma frame: `1567:1763` (`首页开屏`)
- Background layer: `1567:1764` (`image 19`)
- Gradient layer: `1567:1765` (`渐变背景`)
- `launch-background-source.jpg` is the compressed Figma source texture. The splash applies the frame's vertical flip, crop offsets, scale, and `lighten` gradient overlay in CSS, while keeping branding and UI text as accessible HTML.

## Boundaries

- The private `nava-app` repository remains the source of truth.
- The public preview repository contains compiled static files only.
- No `.env`, service-role key, JWT secret, personal token, or production dataset may be published.
- Figma is a read-only design reference; implementation changes belong in the App repository.
