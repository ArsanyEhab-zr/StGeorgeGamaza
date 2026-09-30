import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // 👈 ده السطر اللي كان ناقص وطير التصميم!
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    tailwindcss(), // 👈 تشغيل التصميم
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['image/osra.png', 'image/khedma.png'],
      manifest: {
        name: 'كنيسة مارجرجس غمازة الكبرى',
        short_name: 'مارجرجس',
        description: 'تطبيق إدارة الحضور والغياب لخدمة مدارس الأحد',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        dir: 'rtl',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 
      }
    })
  ]
});