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
        card: '#12161A', // cards / surfaces (also serves shadcn `card`)
        volt: { DEFAULT: '#C6FF3D', dim: '#9FD22E', ink: '#0A0C0B' }, // electric lime accent
        chalk: '#F4F7F2', // primary text on dark
        ash: '#8A938C', // muted text
        line: '#1F2723', // hairline borders
        sos: '#FF5A4D', // craving red (brightened for dark)
        // ── shadcn / React Native Reusables semantic tokens → Bold Momentum ──
        background: '#0A0C0B',
        foreground: '#F4F7F2',
        'card-foreground': '#F4F7F2',
        popover: '#12161A',
        'popover-foreground': '#F4F7F2',
        primary: '#C6FF3D',
        'primary-foreground': '#0A0C0B',
        secondary: '#161B18',
        'secondary-foreground': '#F4F7F2',
        muted: '#161B18',
        'muted-foreground': '#8A938C',
        accent: '#1F2723',
        'accent-foreground': '#F4F7F2',
        destructive: '#FF5A4D',
        'destructive-foreground': '#FFFFFF',
        border: '#1F2723',
        input: '#1F2723',
        ring: '#C6FF3D',
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
