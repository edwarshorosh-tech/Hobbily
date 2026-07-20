/**
 * firebase.ts
 * Initializes Firebase, Authentication with AsyncStorage-backed persistence,
 * and Firestore.
 *
 * Import `auth` and `db` from this file throughout the application.
 * Do not call initializeApp() elsewhere.
 *
 * Firestore is initialized with long-polling forced instead of the default
 * gRPC/WebChannel streaming transport. That streaming transport is what
 * causes the well-known RN/Expo symptom "Could not reach Cloud Firestore
 * backend. Backend didn't respond within 10 seconds" followed by the client
 * falling back to (and getting stuck in) offline mode on some Android/Hermes
 * setups — the SDK's auto-detection for this (on by default) doesn't always
 * catch it, so it's forced explicitly here rather than left to chance.
 */
import { getApp, getApps, initializeApp } from "firebase/app";

// @ts-ignore
import { initializeAuth, getReactNativePersistence } from "firebase/auth";

import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCYvDaQITNmA_-vHs-cjoethTGicmpoKjE",
  authDomain: "hobbily-52e58.firebaseapp.com",
  projectId: "hobbily-52e58",
  storageBucket: "hobbily-52e58.firebasestorage.app",
  messagingSenderId: "478928572862",
  appId: "1:478928572862:web:952cb7ba435e92906a29ef",
};

const REQUIRED_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

/**
 * Dev-only sanity check — reports which config keys are missing (by name
 * only, never their values) and refuses to proceed. A partially-configured
 * Firebase app is a common cause of the exact "client is offline" symptom
 * this file exists to fix, since a bad/empty projectId or apiKey makes every
 * backend connection attempt fail the same way a real network outage would.
 */
function validateFirebaseConfig(config: Record<string, string | undefined>): void {
  const missing = REQUIRED_CONFIG_KEYS.filter((key) => !config[key]);
  if (missing.length === 0) return;

  if (__DEV__) {
    console.warn(
      `[firebase] Missing required config key(s): ${missing.join(", ")}. ` +
        "Firebase will not be initialized until these are set."
    );
  }
  throw new Error(
    "Firebase configuration is incomplete. Check lib/firebase.ts — see the development console for which keys are missing."
  );
}

validateFirebaseConfig(firebaseConfig);

// Reuse the existing app instance if one already exists (e.g. Fast Refresh
// re-evaluating this module) instead of calling initializeApp() again, which
// throws "Firebase App named '[DEFAULT]' already exists".
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch (e) {
    // initializeFirestore() throws if it (or getFirestore()) already ran for
    // this app — e.g. Fast Refresh re-evaluating this module in dev. Fall
    // back to the already-initialized instance instead of crashing.
    return getFirestore(app);
  }
})();

export const storage = getStorage(app);
