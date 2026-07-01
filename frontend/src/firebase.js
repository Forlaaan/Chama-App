import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
  // Using the project ID and Web API key from the backend .env
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDfrzJNtOOtetbFmpKRFc_HdIwjBOsMtHY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "chama-app-7aa36.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "chama-app-7aa36",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "chama-app-7aa36.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "dummy",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "dummy"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// To avoid the invisible recaptcha throwing errors in dev without a valid domain,
// we will configure it when we need it.
export { auth, RecaptchaVerifier, signInWithPhoneNumber };
