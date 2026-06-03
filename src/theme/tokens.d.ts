// Types for the single-source token module (tokens.js).
// Lets TypeScript consume the CommonJS tokens without enabling allowJs.

export const palette: {
  void: string;
  coal: string;
  card: string;
  surface2: string;
  raised: string;
  volt: string;
  voltDim: string;
  voltInk: string;
  voltEdge: string;
  chalk: string;
  ash: string;
  line: string;
  sos: string;
  sosEdge: string;
  white: string;
  inactive: string;
  inactiveInk: string;
};

export const tailwindColors: Record<string, string | Record<string, string>>;
export const fontSize: Record<string, [string, { lineHeight: string }]>;
export const spacing: Record<string, string>;
export const radius: Record<string, string>;
export const haleTeal: Record<string, string>;
