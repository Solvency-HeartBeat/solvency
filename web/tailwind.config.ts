import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        healthy: '#22c55e',
        watch:   '#f59e0b',
        danger:  '#ef4444',
        stale:   '#6b7280',
        unknown: '#3b82f6',
      },
    },
  },
  plugins: [],
};

export default config;
