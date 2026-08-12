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

## Boundaries

- The private `nava-app` repository remains the source of truth.
- The public preview repository contains compiled static files only.
- No `.env`, service-role key, JWT secret, personal token, or production dataset may be published.
- Figma is a read-only design reference; implementation changes belong in the App repository.
