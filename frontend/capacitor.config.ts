import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chamahub.app',
  appName: 'Chama Hub',
  webDir: 'dist',
  server: {
    // Use 'http' during local development to avoid mixed-content blocking.
    // The WebView serves the app from this scheme, so if it's 'https' and
    // our backend is plain HTTP, the browser engine silently blocks the fetch.
    // Change back to 'https' once the backend has a real SSL certificate.
    androidScheme: 'http',
    cleartext: true
  }
};

export default config;
