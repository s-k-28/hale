// Bold Momentum palette — hex for non-className contexts (SVG, Skia, StatusBar, Rive).
// Re-exported from the SINGLE SOURCE OF TRUTH (src/theme/tokens.js) so the className
// tokens (tailwind.config.js) and these runtime hexes can never drift again.
import { palette } from './tokens';

export const colors = {
  void: palette.void,
  coal: palette.coal,
  card: palette.card, // #12161A — unified with tailwind `card` (previously drifted to #161B18)
  volt: palette.volt,
  voltDim: palette.voltDim,
  voltInk: palette.voltInk,
  chalk: palette.chalk,
  ash: palette.ash,
  line: palette.line,
  sos: palette.sos,
} as const;
