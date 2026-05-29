/**
 * firebase.ts
 * Initialises the Firebase app, Auth (with AsyncStorage persistence so the
 * auth token survives app restarts), and Firestore. Import `auth` and `db`
 * from here throughout the app — do not call initializeApp() elsewhere.
 */
import { initializeApp } from "firebase/app";
import { initializeAuth } from "firebase/auth";
import { getReactNativePersistence } from "firebase/auth/react-native";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCYvDaQITNmA_-vHs-cjoethTGicmpoKjE",
  authDomain: "hobbily-52e58.firebaseapp.com",
  projectId: "hobbily-52e58",
  storageBucket: "hobbily-52e58.firebasestorage.app",
  messagingSenderId: "478928572862",
  appId: "1:478928572862:web:952cb7ba435e92906a29ef",
};

const app = initializeApp(firebaseConfig);

// Use AsyncStorage for auth token persistence across app restarts
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
