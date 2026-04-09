import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.musabaqat',
  appName: 'المسابقات الرمضانية',
  webDir: 'dist',
  server: {
    url: "https://4182d607-13e6-4531-b243-80f4598877f3.lovableproject.com?forceHideBadge=true",
    cleartext: true
  },
};

export default config;
