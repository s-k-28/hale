// Clean Dark (design-system v2) — typed RUNTIME hexes for non-className
// contexts (SVG, Skia, StatusBar, shadows, LinearGradient). Same single-source
// rule as the old colors.ts: values live in tokens.js, never here.
// At the purge phase this replaces src/theme/colors.ts entirely.
import { cleanDark } from './tokens';

export const clean = cleanDark;
export type CleanColor = keyof typeof cleanDark;
