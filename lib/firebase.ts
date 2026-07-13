/**
 * firebase.ts
 * Initializes Firebase, Authentication with cross-platform persistence,
 * and Firestore.
 *
 * Import `auth` and `db` from this file throughout the application.
 * Do not call initializeApp() elsewhere.
 */
import { initializeApp } from "firebase/app";

// @ts-ignore
import { initializeAuth, getReactNativePersistence, browserLocalPersistence } from "firebase/auth";

import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyCYvDaQITNmA_-vHs-cjoethTGicmpoKjE",
  authDomain: "hobbily-52e58.firebaseapp.com",
  projectId: "hobbily-52e58",
  storageBucket: "hobbily-52e58.firebasestorage.app",
  messagingSenderId: "478928572862",
  appId: "1:478928572862:web:952cb7ba435e92906a29ef",
};

const app = initializeApp(firebaseConfig);

// Safe cross-platform initialization for both Web (Laptop) and Mobile (Phone)
export const auth = (() => {
  if (Platform.OS === "web") {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
    });
  } else {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
})();

export const db = getFirestore(app);