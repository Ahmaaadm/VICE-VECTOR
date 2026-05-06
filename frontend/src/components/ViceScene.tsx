/**
 * ViceScene — a full-bleed Miami sunset rendered in SVG behind the chat page.
 *
 * Layers (bottom to top):
 *   1. Sky gradient (deep navy → violet → magenta)
 *   2. Star field (tiny dots) high in the sky
 *   3. Half-disc setting sun, with horizontal slats cutting through it
 *      (the classic Outrun / Vice silhouette)
 *   4. Glowing horizon line
 *   5. Reflective ground (orange → magenta) with a perspective grid
 *   6. Palm-tree silhouettes anchored to the horizon (left + right)
 *
 * Lives in `position: fixed; inset: 0; z-index: 0; pointer-events: none;`
 * so the chat content sits on top with z-index ≥ 10.
 */
export function ViceScene() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-0 overflow-hidden pointer-events-none select-none"
    >
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          {/* Sky gradient */}
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0a0118" />
            <stop offset="35%"  stopColor="#1a0635" />
            <stop offset="65%"  stopColor="#52126a" />
            <stop offset="85%"  stopColor="#a8154e" />
            <stop offset="100%" stopColor="#ff2e88" />
          </linearGradient>

          {/* Sun gradient — yellow at top, deepens to magenta */}
          <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#fff0a8" />
            <stop offset="35%"  stopColor="#ffd400" />
            <stop offset="65%"  stopColor="#ff7a3d" />
            <stop offset="100%" stopColor="#ff006e" />
          </linearGradient>

          {/* Ground gradient — orange horizon to deep purple */}
          <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ff5a3d" />
            <stop offset="35%"  stopColor="#9d2860" />
            <stop offset="100%" stopColor="#1a0635" />
          </linearGradient>

          {/* Halo gradient behind the sun for the bloom */}
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ff7a3d" stopOpacity="0.55" />
            <stop offset="70%"  stopColor="#ff006e" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#ff006e" stopOpacity="0" />
          </radialGradient>

          {/* Mask: cut horizontal "venetian blind" stripes out of the sun  */}
          <mask id="sun-stripes" maskUnits="userSpaceOnUse" x="500" y="350" width="600" height="350">
            <rect x="500" y="350" width="600" height="350" fill="white" />
            {/* Each black rect hides part of the sun.  The stripes get
                thicker and closer together near the horizon for depth.  */}
            <rect x="500" y="540" width="600" height="3" fill="black" />
            <rect x="500" y="555" width="600" height="4" fill="black" />
            <rect x="500" y="572" width="600" height="5" fill="black" />
            <rect x="500" y="592" width="600" height="6" fill="black" />
            <rect x="500" y="615" width="600" height="7" fill="black" />
            <rect x="500" y="640" width="600" height="9" fill="black" />
            <rect x="500" y="668" width="600" height="11" fill="black" />
          </mask>

          {/* Glow filter for the horizon line */}
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. SKY ----------------------------------------------------- */}
        <rect x="0" y="0" width="1600" height="700" fill="url(#sky)" />

        {/* 2. STARS — sparse, mostly upper third ---------------------- */}
        <g fill="#fff" opacity="0.85">
          {STAR_DOTS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>

        {/* 3a. SUN HALO (behind disc) --------------------------------- */}
        <ellipse cx="800" cy="700" rx="650" ry="350" fill="url(#halo)" />

        {/* 3b. SUN DISC — half-circle that meets the horizon at y=700 */}
        <circle
          cx="800"
          cy="700"
          r="260"
          fill="url(#sun)"
          mask="url(#sun-stripes)"
        />

        {/* 4. HORIZON LINE — sharp neon pink bar with glow ------------ */}
        <line
          x1="0" y1="700" x2="1600" y2="700"
          stroke="#ff2e88"
          strokeWidth="2"
          filter="url(#neonGlow)"
          opacity="0.9"
        />

        {/* 5. GROUND -------------------------------------------------- */}
        <rect x="0" y="700" width="1600" height="200" fill="url(#ground)" />

        {/* 5b. GROUND PERSPECTIVE GRID — only below horizon */}
        <g stroke="#ff2e88" strokeWidth="1" opacity="0.55">
          {/* horizontals: get further apart as they recede from the camera */}
          {GROUND_H_LINES.map((y, i) => (
            <line key={i} x1="0" y1={y} x2="1600" y2={y} />
          ))}
          {/* verticals: converge toward the vanishing point at the sun */}
          {GROUND_V_LINES.map((x, i) => (
            <line key={i} x1={x} y1="700" x2={vanishX(x)} y2="900" />
          ))}
        </g>

        {/* 6. PALM TREES -------------------------------------------- */}
        <PalmTree x={130} y={690} scale={1.1} />
        <PalmTree x={1450} y={690} scale={1.2} flip />
        <PalmTree x={250} y={695} scale={0.8} />
        <PalmTree x={1330} y={695} scale={0.85} flip />
      </svg>

      {/* CRT scanlines on top of everything */}
      <div
        aria-hidden
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

/* ----- helpers --------------------------------------------------- */

// Vanishing point at the centre of the sun.  Lines starting at x on the
// horizon row aim at the bottom of the screen by extrapolating away from
// the centre — gives the sense of receding into the distance.
function vanishX(x: number) {
  const cx = 800;
  return cx + (x - cx) * 4.5;
}

// Tiny SVG palm-tree silhouette.  Drawn once as a path, scaled & mirrored
// where needed.  Black silhouette with a faint pink rim for separation.
function PalmTree({
  x,
  y,
  scale = 1,
  flip = false,
}: {
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
}) {
  const transform = `translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`;
  return (
    <g transform={transform}>
      {/* trunk */}
      <path
        d="M 0 0 C 5 -40 -2 -90 6 -150 C 8 -170 12 -195 18 -210"
        stroke="#0a0118"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      {/* fronds — six big leaves radiating from the top */}
      <g
        fill="none"
        stroke="#0a0118"
        strokeWidth="7"
        strokeLinecap="round"
      >
        <path d="M 18 -210 C  -5 -228, -40 -224, -75 -195" />
        <path d="M 18 -210 C  40 -230,  85 -224, 110 -195" />
        <path d="M 18 -210 C   8 -240,  -8 -260, -45 -262" />
        <path d="M 18 -210 C  30 -240,  55 -260,  90 -260" />
        <path d="M 18 -210 C  35 -245,  70 -250,  90 -228" />
        <path d="M 18 -210 C   2 -245, -32 -250, -55 -228" />
      </g>
      {/* coconut cluster */}
      <circle cx="20" cy="-208" r="5" fill="#0a0118" />
      <circle cx="13" cy="-206" r="4" fill="#0a0118" />
      <circle cx="24" cy="-202" r="4" fill="#0a0118" />
      {/* faint pink rim so the silhouette doesn't fully disappear into the ground */}
      <path
        d="M 0 0 C 5 -40 -2 -90 6 -150 C 8 -170 12 -195 18 -210"
        stroke="#ff2e88"
        strokeWidth="1"
        fill="none"
        opacity="0.35"
      />
    </g>
  );
}

/* Pre-computed star positions — keeps the JSX tidy and stable. */
const STAR_DOTS: [number, number, number][] = [
  [120, 70, 1.2],   [340, 110, 0.9],  [510, 60, 1.1],
  [690, 130, 0.8], [780, 50, 1.3],   [880, 95, 0.9],
  [1010, 70, 1.0], [1180, 130, 0.8], [1320, 80, 1.2],
  [1480, 140, 1.0], [60, 200, 0.9],  [220, 240, 0.7],
  [430, 220, 0.8], [950, 230, 0.7],  [1240, 250, 0.8],
  [1500, 220, 0.9],
];

/* Horizontal grid lines on the ground (post-horizon).
   Spaced quadratically so they bunch at the horizon. */
const GROUND_H_LINES = [710, 723, 740, 762, 790, 825, 870];

/* Vertical grid lines: x positions at the horizon.  vanishX() projects
   each one down to y=900 so they radiate from the sun. */
const GROUND_V_LINES = [
  100, 250, 400, 550, 680, 760, 800, 840, 920, 1050, 1200, 1350, 1500,
];
