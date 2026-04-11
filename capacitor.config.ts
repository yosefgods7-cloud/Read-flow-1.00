import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.readflow.app',
  appName: 'ReadFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
