/**
 * Auto-discover wallpapers placed in src/assets/wallpapers/.
 *
 * Vite's `import.meta.glob` runs at build time. With { eager: true } it
 * imports every match immediately, and `import: 'default'` makes each value
 * the asset's hashed URL string (rather than a module wrapper).
 *
 * Drop a .jpg / .jpeg / .png / .webp into the folder and it'll appear here
 * after the next dev-server reload — no other code change needed.
 */
const modules = import.meta.glob<string>(
  './assets/wallpapers/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true, import: 'default' },
);

// Sort by filename so ordering is stable; the carousel does its own shuffle on
// mount, so this just keeps the bundle layout deterministic.
export const wallpaperUrls: string[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);
