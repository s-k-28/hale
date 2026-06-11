// Types for the single-source token module (tokens.js).
// Lets TypeScript consume the CommonJS tokens without enabling allowJs.

// Clean Dark (design-system v2) runtime palette.
export const cleanDark: {
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  surface3: string;
  stroke: string;
  stroke2: string;
  hi: string;
  fg: string;
  fg2: string;
  fg3: string;
  fg4: string;
  accent: string;
  accent2: string;
  accentDeep: string;
  accentInk: string;
  accentSoft: string;
  accentEdge: string;
  accentGlow: string;
  warm: string;
  warmSoft: string;
  warmEdge: string;
  warmInk: string;
  coral: string;
  coralSoft: string;
  coralEdge: string;
  coralInk: string;
  track: string;
};

export const tailwindColors: Record<string, string | Record<string, string>>;
export const fontSize: Record<string, [string, { lineHeight: string; letterSpacing?: string }]>;
export const spacing: Record<string, string>;
export const radius: Record<string, string>;
