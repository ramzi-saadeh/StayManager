import { AppEnvironment } from './environment.model';

// =============================================================================
// ENVIRONMENT TEMPLATE
//
// This file is the committed reference template. It contains no real credentials.
//
// SETUP INSTRUCTIONS:
//   1. Copy this file:
//        cp src/environments/environment.example.ts src/environments/environment.ts
//      (for development)
//      OR
//        cp src/environments/environment.example.ts src/environments/environment.production.ts
//      (for production)
//
//   2. Fill in real values from:
//        Firebase Console → Project Settings → Your apps → Web app → SDK setup and config
//
//   3. Never commit the filled-in environment.ts or environment.production.ts.
//      Both are listed in .gitignore.
//
// Local development uses the emulator-only demo project. Never replace these
// with a production project while useEmulators is true.
// =============================================================================

export const environment: AppEnvironment = {
  production: false,

  /**
   * Set to true to route all Firebase SDK calls through local emulators.
   * Requires the Firebase Emulator Suite to be running:
   *   firebase emulators:start
   */
  useEmulators: true,
  messagingVapidKey: '',

  /**
   * Base URL for Cloud Function HTTP calls.
   * Development:  'http://localhost:5001/{PROJECT_ID}/{REGION}'
   * Production:   'https://{REGION}-{PROJECT_ID}.cloudfunctions.net'
   */
  cloudFunctionsBaseUrl: 'http://127.0.0.1:5001/demo-staymanager-local/us-central1',
  siteUrl: 'http://localhost:4300',

  imageKit: {
    publicKey: '',
    urlEndpoint: 'https://ik.imagekit.io/your-imagekit-id',
    token: '',
    signature: '',
    expire: 0,
  },

  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-staymanager-local.firebaseapp.com',
    projectId: 'demo-staymanager-local',
    storageBucket: 'demo-staymanager-local.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:local-emulator',
  },
};
