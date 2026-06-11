// HALE — "Clean Dark" design tokens (v2) · SINGLE SOURCE OF TRUTH.
//
// Every token value lives here and ONLY here. Consumed by:
//   • tailwind.config.js  → className tokens (bg-bg, text-fg, bg-accent, …)
//   • src/theme/clean.ts  → typed runtime hexes (SVG / Skia / StatusBar / shadows)
//
// Source design: the approved Clean Dark bundle's styles.css (:root).
// Discipline (locked in the design chat): ONE emerald accent — one focal
// element + one primary CTA per screen; coral is SOS/danger ONLY; warm amber
// is buddy/"together"/referral ONLY.
//
// CommonJS so tailwind.config.js (Node) can require() it. Types in tokens.d.ts.

const cleanDark = {
  bg: '#0B0F0D', // app base — premium dark, never pure black
  bg2: '#0E1311',
  surface: '#151B18', // card
  surface2: '#1C2420', // elevated / input
  surface3: '#25302A', // pressed / hover
  stroke: 'rgba(255,255,255,0.07)', // hairline borders
  stroke2: 'rgba(255,255,255,0.13)',
  hi: 'rgba(255,255,255,0.04)', // top inner highlight on cards
  fg: '#EAF1EC', // primary text
  fg2: '#97A39B', // secondary
  fg3: '#616B64', // muted / labels
  fg4: '#424A45',
  accent: '#34D399', // THE focal emerald
  accent2: '#5EE3B0',
  accentDeep: '#1FA577',
  accentInk: '#052B1E', // text on accent
  accentSoft: 'rgba(52,211,153,0.12)',
  accentEdge: 'rgba(52,211,153,0.26)', // accent hairline ring
  accentGlow: 'rgba(52,211,153,0.35)',
  warm: '#F2B95C', // buddy / together / referral moments ONLY
  warmSoft: 'rgba(242,185,92,0.12)',
  warmEdge: 'rgba(242,185,92,0.28)',
  coral: '#FF6B5C', // SOS / relapse ONLY
  coralSoft: 'rgba(255,107,92,0.12)',
  coralEdge: 'rgba(255,107,92,0.30)',
  coralInk: '#2A0B07', // text on a coral button
  warmInk: '#2B1E07', // text on a warm button
  track: 'rgba(255,255,255,0.08)', // progress-bar trough
};

// Tailwind / NativeWind color object (className tokens), derived from cleanDark.
const tailwindColors = {
  bg: { DEFAULT: cleanDark.bg, 2: cleanDark.bg2 },
  surface: { DEFAULT: cleanDark.surface, 2: cleanDark.surface2, 3: cleanDark.surface3 },
  stroke: { DEFAULT: cleanDark.stroke, 2: cleanDark.stroke2 },
  hi: cleanDark.hi,
  fg: { DEFAULT: cleanDark.fg, 2: cleanDark.fg2, 3: cleanDark.fg3, 4: cleanDark.fg4 },
  accent: {
    DEFAULT: cleanDark.accent,
    2: cleanDark.accent2,
    deep: cleanDark.accentDeep,
    ink: cleanDark.accentInk,
    soft: cleanDark.accentSoft,
    edge: cleanDark.accentEdge,
    glow: cleanDark.accentGlow,
  },
  warm: { DEFAULT: cleanDark.warm, soft: cleanDark.warmSoft, edge: cleanDark.warmEdge, ink: cleanDark.warmInk },
  coral: { DEFAULT: cleanDark.coral, soft: cleanDark.coralSoft, edge: cleanDark.coralEdge, ink: cleanDark.coralInk },
  track: cleanDark.track,
};

// Clean Dark type ramp (from styles.css) — Sora everywhere.
const fontSize = {
  hero: ['88px', { lineHeight: '92px', letterSpacing: '-2.6px' }], // Sora clips below ~1.05lh
  h1: ['30px', { lineHeight: '36px', letterSpacing: '-0.75px' }],
  h2: ['23px', { lineHeight: '28px', letterSpacing: '-0.46px' }],
  h3: ['18px', { lineHeight: '23px', letterSpacing: '-0.18px' }],
  lead: ['16px', { lineHeight: '25px' }],
  body: ['15px', { lineHeight: '23px' }],
  eyebrow: ['12px', { lineHeight: '16px', letterSpacing: '1.56px' }], // 0.13em caps
};

// Rhythmic spacing — the 4pt design scale IS Tailwind's default scale; only the
// shared screen gutter is named.
const spacing = {
  gutter: '24px', // standard horizontal screen padding
};

const radius = {
  pill: '999px',
  panel: '22px', // r-card
  tile: '16px', // r-lg
  inset: '9px', // r-sm
  xl2: '26px', // r-xl (sheets)
  // 12px (r-md) == Tailwind's default `rounded-xl` — no custom key needed
};

module.exports = { cleanDark, tailwindColors, fontSize, spacing, radius };
