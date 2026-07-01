function envOrDefault(viteKey, fallback) {
  const val = import.meta.env?.[viteKey];
  if (val && val !== 'undefined' && val !== 'null') return val;
  return fallback;
}

export const firebaseConfig = {
  apiKey:            envOrDefault('VITE_FIREBASE_API_KEY',             'AIzaSyDS6hY6aJwCUJDKncGBP_5t6C7MBQP8oT4'),
  authDomain:        envOrDefault('VITE_FIREBASE_AUTH_DOMAIN',         'koc3-f4203.firebaseapp.com'),
  databaseURL:       envOrDefault('VITE_FIREBASE_DATABASE_URL',        'https://koc3-f4203-default-rtdb.firebaseio.com'),
  projectId:         envOrDefault('VITE_FIREBASE_PROJECT_ID',          'koc3-f4203'),
  storageBucket:     envOrDefault('VITE_FIREBASE_STORAGE_BUCKET',      'koc3-f4203.firebasestorage.app'),
  messagingSenderId: envOrDefault('VITE_FIREBASE_MESSAGING_SENDER_ID', '821260737390'),
  appId:             envOrDefault('VITE_FIREBASE_APP_ID',              '1:821260737390:web:7927bd7ebf1d2f4d15bf7f'),
  measurementId:     envOrDefault('VITE_FIREBASE_MEASUREMENT_ID',      'G-271218KTHL'),
};

export const firebaseAppName = 'koc3-app';
