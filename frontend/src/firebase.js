import { getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

import { firebaseAppName, firebaseConfig } from './firebaseConfig';
import { PATHS } from './firebasePaths';

function normalizeDatabaseUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    throw new Error(`Firebase databaseURL is invalid: "${rawUrl}". Use VITE_FIREBASE_DATABASE_URL with a full URL like https://your-project-default-rtdb.firebaseio.com`);
  }
}

if (!firebaseConfig.projectId || !firebaseConfig.databaseURL) {
  throw new Error('Firebase configuration is missing projectId or databaseURL. Check VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_DATABASE_URL.');
}

const databaseURL = normalizeDatabaseUrl(firebaseConfig.databaseURL);


export const app = getApps().find(existingApp => existingApp.name === firebaseAppName) || initializeApp(firebaseConfig, firebaseAppName);

// App Check is opt-in via VITE_FIREBASE_APPCHECK_SITE_KEY (a reCAPTCHA v3 site key
// from Firebase Console → App Check → register app). Without it, this is a no-op —
// safe to leave unset until App Check enforcement is configured in the console.
const appCheckSiteKey = import.meta.env?.VITE_FIREBASE_APPCHECK_SITE_KEY;
if (appCheckSiteKey) {
  if (import.meta.env.DEV) {
    // Lets localhost pass App Check during development without solving a real
    // reCAPTCHA — register the printed token under App Check → Debug tokens.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env?.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = getDatabase(app, databaseURL);

let authPromise = null;
export function ensureAuth() {
  if (!authPromise) {
    authPromise = signInAnonymously(auth).catch(err => {
      console.error('Anonymous auth failed', err);
    });
  }
  return authPromise;
}

export { PATHS };
