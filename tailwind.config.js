/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // HALE brand — calm, gain-framed teal (see PRD design principles)
        hale: {
          50: '#e7f3ee',
          100: '#c5e3d6',
          400: '#39a37c',
          500: '#0f7a5a', // primary
          600: '#0c624a',
          900: '#0a2f24',
        },
        sos: '#c0392b', // craving SOS
      },
    },
  },
  plugins: [],
};
