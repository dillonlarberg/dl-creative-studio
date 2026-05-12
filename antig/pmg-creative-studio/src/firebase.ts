import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
    apiKey: "AIzaSyDwnBEjbWTkF9ugTYlq-_jvzNpXsW401AQ",
    authDomain: "automated-creative-e10d7.firebaseapp.com",
    projectId: "automated-creative-e10d7",
    storageBucket: "automated-creative-e10d7.firebasestorage.app",
    messagingSenderId: "663631825004",
    appId: "1:663631825004:web:e6d6da5214afdb6700b049"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ── Firebase App Check ──────────────────────────────────────────────
// Verifies that every request to runOutpaintBatch (and any other callable
// that opts in via `enforceAppCheck: true`) originates from this registered
// web app — not a curl script with a stolen ID token.
//
// Setup (one-time per Firebase project):
//   1. Create a reCAPTCHA Enterprise key at
//      https://console.cloud.google.com/security/recaptcha?project=automated-creative-e10d7
//   2. Register the key under Firebase Console → App Check → Web
//      → reCAPTCHA Enterprise provider.
//   3. Put the public site key into `VITE_APPCHECK_RECAPTCHA_KEY` in
//      .env.local (and your CI env). The key is safe to ship to the
//      browser; it's domain-scoped by reCAPTCHA's own enforcement.
//
// In dev without the key, we set `FIREBASE_APPCHECK_DEBUG_TOKEN = true`
// on `self`. The first page load logs a debug token to the console;
// register that token under Firebase Console → App Check → Apps → Debug
// tokens so your machine can talk to App-Check-enforcing callables.
const RECAPTCHA_KEY = import.meta.env.VITE_APPCHECK_RECAPTCHA_KEY;
if (import.meta.env.DEV && !RECAPTCHA_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
if (typeof window !== 'undefined') {
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(
                RECAPTCHA_KEY ?? '6Lc-PLACEHOLDER-replace-with-real-site-key',
            ),
            isTokenAutoRefreshEnabled: true,
        });
    } catch (err) {
        // Initializing twice in HMR is benign — log and move on.
        // eslint-disable-next-line no-console
        console.warn('App Check init skipped:', err);
    }
}

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app;
