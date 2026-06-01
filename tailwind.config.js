/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── Bold Momentum ── dark + electric lime
        void: '#0A0C0B', // app background (near-black)
        coal: '#12161A', // elevated surface
        card: '#161B18', // cards
        volt: { DEFAULT: '#C6FF3D', dim: '#9FD22E', ink: '#0A0C0B' }, // electric lime accent
        chalk: '#F4F7F2', // primary text on dark
        ash: '#8A938C', // muted text
        line: '#1F2723', // hairline borders
        sos: '#FF5A4D', // craving red (brightened for dark)
        // legacy teal kept so un-reskinned screens stay readable during transition
        hale: {
          50: '#e7f3ee',
          100: '#c5e3d6',
          400: '#39a37c',
          500: '#0f7a5a',
          600: '#0c624a',
          900: '#0a2f24',
        },
      },
      fontFamily: {
        display: ['Anton_400Regular'], // huge condensed numerals/hero
        heading: ['Archivo_800ExtraBold'],
        'heading-bold': ['Archivo_700Bold'],
        body: ['HankenGrotesk_400Regular'],
        'body-medium': ['HankenGrotesk_500Medium'],
        'body-semibold': ['HankenGrotesk_600SemiBold'],
        'body-bold': ['HankenGrotesk_700Bold'],
      },
    },
  },
  plugins: [],
};
