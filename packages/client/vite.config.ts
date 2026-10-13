import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { target: 'es2022', sourcemap: true },
});
