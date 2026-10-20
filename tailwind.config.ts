import type { Config } from 'tailwindcss'
const config: Config = { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#16312a', forest: '#1c5947', moss: '#6f9f55', cream: '#f4f7ef', sun: '#e9b949' }, boxShadow: { soft: '0 18px 45px rgba(24, 64, 47, 0.08)' } } }, plugins: [] }
export default config
