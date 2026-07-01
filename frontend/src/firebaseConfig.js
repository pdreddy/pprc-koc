function envOrDefault(viteKey, fallback) {
  const val = import.meta.env?.[viteKey];
  if (val && val !== 'undefined' && val !== 'null') return val;
  return fallback;
}

export const firebaseConfig = {
  apiKey:            envOrDefault('VITE_FIREBASE_API_KEY',             'AIzaSyDbO0eP52i4t3V94bEiDcl7WoKbSrrM9VA'),
  authDomain:        envOrDefault('VITE_FIREBASE_AUTH_DOMAIN',         'koc2-20fb8.firebaseapp.com'),
  databaseURL:       envOrDefault('VITE_FIREBASE_DATABASE_URL',        'https://koc2-20fb8-default-rtdb.firebaseio.com'),
  projectId:         envOrDefault('VITE_FIREBASE_PROJECT_ID',          'koc2-20fb8'),
  storageBucket:     envOrDefault('VITE_FIREBASE_STORAGE_BUCKET',      'koc2-20fb8.firebasestorage.app'),
  messagingSenderId: envOrDefault('VITE_FIREBASE_MESSAGING_SENDER_ID', '317734341461'),
  appId:             envOrDefault('VITE_FIREBASE_APP_ID',              '1:317734341461:web:1bcad5a1792fac0e46bddc'),
};

export const firebaseAppName = 'koc3-app';
