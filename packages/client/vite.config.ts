import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: { '/api': { target: 'http://localhost:3000', ws: true } },
  },
  build: { target: 'es2022', sourcemap: true },
});
