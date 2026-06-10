/** @type {import('tailwindcss').Config} */
// Token values are NOT inlined here — they live in src/theme/tokens.js (the single
// source of truth shared with the typed runtime palette) so className tokens and
// runtime hexes can never drift.
const tokens = require('./src/theme/tokens.js');

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tokens.tailwindColors,
      fontSize: tokens.fontSize,
      spacing: tokens.spacing,
      borderRadius: tokens.radius,
      fontFamily: {
        display: ['Anton_400Regular'], // huge condensed numerals / hero
        heading: ['Archivo_800ExtraBold'],
        'heading-bold': ['Archivo_700Bold'],
        body: ['HankenGrotesk_400Regular'],
        'body-medium': ['HankenGrotesk_500Medium'],
        'body-semibold': ['HankenGrotesk_600SemiBold'],
        'body-bold': ['HankenGrotesk_700Bold'],
        // ── Clean Dark (v2): Sora is the ONLY family in the new system ──
        sora: ['Sora_400Regular'],
        'sora-light': ['Sora_300Light'],
        'sora-medium': ['Sora_500Medium'],
        'sora-semibold': ['Sora_600SemiBold'],
        'sora-bold': ['Sora_700Bold'],
        'sora-extrabold': ['Sora_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
