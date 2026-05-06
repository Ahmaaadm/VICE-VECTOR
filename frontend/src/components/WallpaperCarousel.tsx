import { useEffect, useMemo, useState } from 'react';
import { wallpaperUrls } from '../wallpapers';

// ----- tunable knobs -----
const INTERVAL_MS = 4000; // how long each image is visible (including fade)
const FADE_MS     = 1000; // crossfade duration
const BLUR_PX     = 5;
const BRIGHTNESS  = 0.55;
const SATURATION  = 1.25;
// -------------------------

/**
 * Full-bleed background carousel of GTA 6 wallpapers.
 *
 * Mounts every wallpaper as an absolutely-positioned <img> stacked at z-0.
 * Switching between them is just a CSS opacity transition — no DOM churn,
 * no layout thrash, browser caches each frame.  Respects
 * prefers-reduced-motion by freezing on a single image.
 */
export function WallpaperCarousel() {
  // Shuffle once per mount so consecutive sessions feel different.
  const order = useMemo(() => shuffle(wallpaperUrls), []);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (order.length <= 1) return;
    if (typeof window === 'undefined') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % order.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(t);
  }, [order.length]);

  if (order.length === 0) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-0 overflow-hidden pointer-events-none select-none"
    >
      {/* Layered images.  Active image: opacity 1, slowly zooms from
          scale(1.18) → scale(1.06) over the visible window (Ken Burns).
          Inactive image: opacity 0, transform snaps back to 1.18 — but
          only AFTER the fade-out completes (transition-delay) so the user
          doesn't see a scale jump mid-fade. */}
      {order.map((url, i) => {
        const active = i === idx;
        return (
          <img
            key={url}
            src={url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: active ? 1 : 0,
              transform: active ? 'scale(1.06)' : 'scale(1.18)',
              filter: `blur(${BLUR_PX}px) brightness(${BRIGHTNESS}) saturate(${SATURATION})`,
              transition: active
                // when becoming active: opacity fades in, scale animates the
                // entire visible duration (ease-out so it slows near the end)
                ? `opacity ${FADE_MS}ms ease-in-out, transform ${INTERVAL_MS}ms ease-out`
                // when becoming inactive: opacity fades out; transform stays
                // put during the fade (delayed reset) then snaps back.
                : `opacity ${FADE_MS}ms ease-in-out, transform 0s ${FADE_MS}ms`,
              willChange: 'opacity, transform',
            }}
            // Eager-load the first image, lazy-load the rest so we don't burn
            // bandwidth on stuff the user may never see.
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        );
      })}

      {/* Vice tint — radial magenta lift at the bottom for that Miami sunset feel */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 100%, rgba(255, 46, 136, 0.22) 0%, transparent 60%)',
        }}
      />

      {/* Top-down readability gradient: dark band at top so the header stays
          legible, and a heavier dark band at the bottom to support the
          composer's sticky bar. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0118]/55 via-[#0a0118]/25 to-[#0a0118]/80" />

      {/* CRT scanlines on top — same intensity as the SVG fallback uses */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}

/* Fisher–Yates shuffle. Returns a new array; the input is untouched. */
function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
