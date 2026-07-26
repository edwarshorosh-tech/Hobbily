import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  getAdditionalUserInfo,
} from "firebase/auth";
import {
  doc, deleteDoc, getDoc, getDocs, collection, query, where,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../lib/firebase";

/** All community channel IDs — mirrors DEFAULT_CHANNELS in CommunityContext */
const COMMUNITY_CHANNEL_IDS = [
  "photography", "music", "drawing", "coding", "sports",
  "cooking", "gaming", "reading", "dance", "film",
];

type AuthContextType = {
  user: User | null;
  /** True once the Firebase auth state has been determined (may still be null) */
  isAuthLoaded: boolean;
  /** Resolves to Firebase's own `isNewUser` flag (from getAdditionalUserInfo) — true for every successful call in practice, since createUserWithEmailAndPassword throws auth/email-already-in-use rather than succeeding for an existing email. Callers use this to trigger new-account-only flows (e.g. the post-signup OnboardingTour) without having to re-derive "is this a fresh account" themselves. */
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-authenticates, deletes Firestore profile + progress data, then deletes the Firebase Auth user. */
  deleteAccount: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoaded(true);
    });
    return unsub;
  }, []);

  async function signUp(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return getAdditionalUserInfo(credential)?.isNewUser ?? true;
  }

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    await fbSignOut(auth);
  }

  async function deleteAccount(password: string) {
    if (!user || !user.email) return;

    // Step 1: Re-authenticate so Firebase accepts the deleteUser call
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);

    // Step 2: Read profile to resolve username (used as author key in posts/messages)
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const username: string | undefined = profileSnap.data()?.username;

    if (username) {
      // Step 3: Delete all posts authored by this user
      const postsSnap = await getDocs(
        query(collection(db, "posts"), where("username", "==", username))
      );
      await Promise.allSettled(postsSnap.docs.map((d) => deleteDoc(d.ref)));

      // Step 4: Delete all community messages authored by this user
      await Promise.allSettled(
        COMMUNITY_CHANNEL_IDS.map(async (channelId) => {
          const msgsSnap = await getDocs(
            query(
              collection(db, "channels", channelId, "messages"),
              where("author", "==", username)
            )
          );
          return Promise.allSettled(msgsSnap.docs.map((d) => deleteDoc(d.ref)));
        })
      );
    }

    // Step 5: Clear all local AsyncStorage data for this device
    await AsyncStorage.multiRemove([
      "@hobbily_tasks",
      "@hobbily_daily_reminder",
      "@hobbily_reminder_shown_date",
      "@hobbily_joined_channels",
      "@hobbily_tip_feed_first_post",
      "@hobbily_tip_community_channels",
      "@hobbily_tip_time_session",
    ]);

    // Step 6: Delete Firestore profile + progress docs
    await Promise.allSettled([
      deleteDoc(doc(db, "users", user.uid)),
      deleteDoc(doc(db, "progress", user.uid)),
    ]);

    // Step 7: Delete the Firebase Auth user (use currentUser — state ref may be stale)
    const freshUser = auth.currentUser;
    if (freshUser) await deleteUser(freshUser);
  }

  return (
    <AuthContext.Provider value={{ user, isAuthLoaded, signUp, signIn, signOut, deleteAccount } as AuthContextType}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
