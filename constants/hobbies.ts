import { Ionicons } from "@expo/vector-icons";

export type HobbyOption = { label: string; icon: keyof typeof Ionicons.glyphMap };

/**
 * The canonical suggested-hobby list — originally defined only in the
 * onboarding flow, now shared with the Settings hobbies editor and the New
 * Post "Related hobbies" picker so all three stay in sync.
 */
export const HOBBY_OPTIONS: HobbyOption[] = [
  { label: "Music", icon: "musical-notes-outline" },
  { label: "Sports", icon: "football-outline" },
  { label: "Photography", icon: "camera-outline" },
  { label: "Drawing & Art", icon: "color-palette-outline" },
  { label: "Coding", icon: "code-slash-outline" },
  { label: "Cooking", icon: "restaurant-outline" },
  { label: "Gaming", icon: "game-controller-outline" },
  { label: "Reading", icon: "book-outline" },
  { label: "Dance", icon: "body-outline" },
  { label: "Film & Video", icon: "videocam-outline" },
  { label: "Languages", icon: "globe-outline" },
  { label: "Science", icon: "flask-outline" },
  { label: "Writing", icon: "pencil-outline" },
  { label: "Theater", icon: "happy-outline" },
  { label: "Yoga", icon: "accessibility-outline" },
  { label: "Fashion", icon: "shirt-outline" },
];
