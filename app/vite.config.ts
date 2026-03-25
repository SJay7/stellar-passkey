import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  define: {
    // Polyfill for Buffer references in @stellar/stellar-sdk
    global: 'globalThis',
  },
});
