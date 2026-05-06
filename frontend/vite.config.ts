import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Forward all API calls to the .NET backend in dev so we don't need CORS.
      '/api': {
        target: 'http://localhost:5035',
        changeOrigin: true,
      },
    },
  },
});
