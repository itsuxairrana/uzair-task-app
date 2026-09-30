import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `npm run dev` talks to a local `wrangler dev` (Worker + local D1) on :8787.
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
