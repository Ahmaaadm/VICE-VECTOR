# Wallpapers

Drop GTA 6 wallpaper images here and they will automatically appear as the chat
page background — blurred, darkened, and crossfading every 4 seconds.

## How it works

`src/wallpapers.ts` calls Vite's `import.meta.glob` over this folder and
imports every matching file as a hashed asset URL.

The chat page checks `wallpaperUrls.length`:
- `> 0` → renders `<WallpaperCarousel />` (this folder's images)
- `= 0` → falls back to the SVG sunset scene (`<ViceScene />`)

So just drop files in and reload the page — no code change needed.

## File format

- Accepted: `.jpg`, `.jpeg`, `.png`, `.webp`
- Recommended: `.webp` or compressed `.jpg`
- Recommended size: 1920×1080 or larger, landscape orientation
- Sweet spot: 3–10 images. More is fine, just adds bundle weight.

## Tuning

Constants live at the top of `src/components/WallpaperCarousel.tsx`:

```ts
const INTERVAL_MS = 4000;        // time per image
const FADE_MS     = 1000;        // crossfade duration
const BLUR_PX     = 20;          // background blur strength
const BRIGHTNESS  = 0.55;        // 0..1 — darken so neon UI stays readable
const SATURATION  = 1.25;        // boost colour for the Miami vibe
```

This file (`README.md`) is ignored by the glob pattern, so it stays here as
documentation without showing up as a wallpaper.
