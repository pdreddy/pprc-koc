function envOrDefault(viteKey, fallback) {
  const val = import.meta.env?.[viteKey];
  if (val && val !== 'undefined' && val !== 'null') return val;
  return fallback;
}
export const firebaseConfig = {
  apiKey:            envOrDefault('VITE_FIREBASE_API_KEY',             'AIzaSyAKeiFxkYgkrzgVSMYPv2BGYpjmuOZodg8'),
  authDomain:        envOrDefault('VITE_FIREBASE_AUTH_DOMAIN',         'pprc-730c9.firebaseapp.com'),
  databaseURL:       envOrDefault('VITE_FIREBASE_DATABASE_URL',        'https://pprc-730c9-default-rtdb.firebaseio.com'),
  projectId:         envOrDefault('VITE_FIREBASE_PROJECT_ID',          'pprc-730c9'),
  storageBucket:     envOrDefault('VITE_FIREBASE_STORAGE_BUCKET',      'pprc-730c9.firebasestorage.app'),
  messagingSenderId: envOrDefault('VITE_FIREBASE_MESSAGING_SENDER_ID', '470570362826'),
  appId:             envOrDefault('VITE_FIREBASE_APP_ID',              '1:470570362826:web:7f2ac29a1e9f8bf3479133'),
  measurementId:     envOrDefault('VITE_FIREBASE_MEASUREMENT_ID',      'G-Z4PNWLR7YD'),
};

export const firebaseAppName = 'koc3-app';
