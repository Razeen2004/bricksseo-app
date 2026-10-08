/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#070709',
        card: '#0e0e12',
        'card-hover': '#131318',
        border: 'rgba(255,255,255,0.08)',
        ink: '#f4f4f6',
        muted: '#9999a6',
        accent: {
          DEFAULT: '#7b79f5',
          hover: '#8f8dfa',
          dim: 'rgba(123,121,245,0.15)',
        },
        success: '#34d399',
        danger: '#fb7185',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
