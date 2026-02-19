import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Required for React Router — serve index.html for all routes
    // so direct navigation to /dashboard, /alerts, etc. works
    historyApiFallback: true,
  },
})

