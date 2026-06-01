import { config as base } from '@tamagui/config'
import { createFont, createTamagui, createTokens } from 'tamagui'

/* ─────────── Bold Momentum tokens ───────────
 * Dark + electric lime. Liquid Death meets Whoop. Built on the proven
 * @tamagui/config base (verified rendering on Expo 56 / RN 0.85 / Hermes v1). */
const boldColors = {
  void: '#0A0C0B',
  coal: '#12161A',
  card: '#12161A',
  line: '#1F2723',
  hairline: '#2A332D',
  volt: '#C6FF3D',
  voltDim: '#9FD22E',
  voltInk: '#0A0C0B',
  voltGlow: 'rgba(198, 255, 61, 0.25)',
  voltSoft: 'rgba(198, 255, 61, 0.12)',
  voltEdge: 'rgba(198, 255, 61, 0.40)',
  chalk: '#F4F7F2',
  ash: '#8A938C',
  ashDim: '#5A625B',
  sos: '#FF5A4D',
  success: '#6BE38A',
}

/* Font `face` values MUST equal the keys registered in useFonts (_layout.tsx),
 * or weights silently fall back. We register @expo-google-fonts keys verbatim. */
const displayFont = createFont({
  family: 'Anton_400Regular',
  size: { 1: 12, 2: 16, 3: 22, 4: 32, 5: 44, 6: 64, 7: 88, 8: 120, 9: 168, 10: 200 },
  lineHeight: { 1: 16, 2: 20, 3: 28, 4: 40, 5: 54, 6: 76, 7: 104, 8: 140, 9: 196, 10: 232 },
  letterSpacing: { 1: 0, 4: -0.5, 6: -1, 8: -2.5, 9: -5 },
  weight: { 1: '400' },
  face: {
    400: { normal: 'Anton_400Regular' },
    700: { normal: 'Anton_400Regular' },
    900: { normal: 'Anton_400Regular' },
  },
})

const headlineFont = createFont({
  family: 'Archivo_700Bold',
  size: { 1: 11, 2: 13, 3: 15, 4: 18, 5: 22, 6: 28, 7: 36, 8: 44, 9: 56 },
  lineHeight: { 1: 14, 2: 16, 3: 20, 4: 24, 5: 28, 6: 34, 7: 44, 8: 52, 9: 66 },
  letterSpacing: { 1: 0, 4: -0.2, 6: -0.5, 8: -1 },
  weight: { 1: '400', 4: '600', 5: '700', 6: '800', 7: '900' },
  face: {
    400: { normal: 'Archivo_700Bold' },
    600: { normal: 'Archivo_600SemiBold' },
    700: { normal: 'Archivo_700Bold' },
    800: { normal: 'Archivo_800ExtraBold' },
    900: { normal: 'Archivo_900Black' },
  },
})

const bodyFont = createFont({
  family: 'HankenGrotesk_400Regular',
  size: { 1: 10, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17, 9: 18, 10: 20 },
  lineHeight: { 1: 14, 2: 16, 3: 17, 4: 19, 5: 20, 6: 22, 7: 24, 8: 26, 9: 28, 10: 32 },
  letterSpacing: { 1: 0.12, 2: 0.04, 4: 0, 6: -0.2 },
  weight: { 1: '400', 2: '500', 3: '600', 4: '700', 5: '800' },
  face: {
    400: { normal: 'HankenGrotesk_400Regular' },
    500: { normal: 'HankenGrotesk_500Medium' },
    600: { normal: 'HankenGrotesk_600SemiBold' },
    700: { normal: 'HankenGrotesk_700Bold' },
    800: { normal: 'HankenGrotesk_800ExtraBold' },
  },
})

const tokens = createTokens({
  ...base.tokens,
  color: { ...base.tokens.color, ...boldColors },
})

/* Brand palette in the THEME so $volt/$void/etc. resolve for color props at runtime. */
const boldTheme = {
  background: boldColors.void,
  backgroundHover: boldColors.coal,
  backgroundPress: boldColors.coal,
  backgroundFocus: boldColors.coal,
  backgroundStrong: boldColors.coal,
  backgroundTransparent: 'rgba(10, 12, 11, 0)',
  color: boldColors.chalk,
  colorHover: boldColors.chalk,
  colorPress: boldColors.chalk,
  colorFocus: boldColors.chalk,
  colorTransparent: 'rgba(244, 247, 242, 0)',
  borderColor: boldColors.line,
  borderColorHover: boldColors.hairline,
  borderColorPress: boldColors.voltEdge,
  borderColorFocus: boldColors.volt,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowColorHover: 'rgba(0, 0, 0, 0.6)',
  placeholderColor: boldColors.ashDim,
  outlineColor: boldColors.volt,
  ...boldColors,
}

export const config = createTamagui({
  ...base,
  tokens,
  fonts: {
    heading: headlineFont,
    body: bodyFont,
    display: displayFont,
    mono: base.fonts.mono,
  },
  themes: {
    // Dark-only product: both names resolve to the same Bold Momentum theme.
    dark: boldTheme,
    light: boldTheme,
  },
  defaultFont: 'body',
  settings: {
    ...base.settings,
    onlyAllowShorthands: false,
  },
})

export default config

type Conf = typeof config
declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
