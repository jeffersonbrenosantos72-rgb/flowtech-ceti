import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: { '/api': `http://127.0.0.1:${process.env.FLOWTECH_API_PORT ?? '3001'}` },
  },
});
