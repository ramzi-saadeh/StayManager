import { FirebaseOptions } from 'firebase/app';

export interface AppEnvironment {
  production: boolean;

  imageKit?: {
    publicKey?: string;
    urlEndpoint?: string;
    token?: string;
    signature?: string;
    expire?: number | string;
  };

  /**
   * When true, the app connects to local Firebase emulators instead of
   * live Firebase services. Set to true for local development.
   * Never true in environment.production.ts.
   */
  useEmulators: boolean;

  /** Public Web Push VAPID key from Firebase project settings. */
  messagingVapidKey?: string;

  /**
   * Base URL for Cloud Function HTTP calls used by FunctionService.
   * Development: Firebase emulator URL.
   * Production: https://REGION-PROJECT_ID.cloudfunctions.net
   */
  cloudFunctionsBaseUrl: string;

  /**
   * Public absolute base URL used for canonical/OG URLs.
   * Example: https://staymanager.example.com
   */
  siteUrl?: string;

  firebase: FirebaseOptions;
}