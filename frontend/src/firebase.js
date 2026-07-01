import { getApps, initializeApp } from 'firebase/app';
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
