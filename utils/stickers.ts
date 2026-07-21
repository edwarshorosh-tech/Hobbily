/**
 * The starter sticker pack. No custom illustrated art exists in this project
 * yet, so these are large emoji rendered at sticker size (see the "sticker"
 * branch of MessageBubble in app/(tabs)/community.tsx) — a real, working
 * sticker system (stable id, own message type, its own rendering, never
 * plain chat text) rather than a non-functional button or fake stickers
 * disguised as text. Swapping in real illustrated art later only means
 * changing STICKER_PACK's `render` values — every message already stores a
 * stable `stickerId`, never the emoji itself, so existing messages keep
 * rendering correctly after that swap.
 */
export type Sticker = { id: string; emoji: string; label: string };

export const STICKER_PACK: Sticker[] = [
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "party", emoji: "🎉", label: "Party" },
  { id: "clap", emoji: "👏", label: "Clap" },
  { id: "laugh", emoji: "😂", label: "Laughing" },
  { id: "heart", emoji: "❤️", label: "Heart" },
  { id: "thumbs_up", emoji: "👍", label: "Thumbs up" },
  { id: "star_eyes", emoji: "🤩", label: "Starstruck" },
  { id: "trophy", emoji: "🏆", label: "Trophy" },
  { id: "guitar", emoji: "🎸", label: "Guitar" },
  { id: "camera", emoji: "📷", label: "Camera" },
  { id: "soccer", emoji: "⚽", label: "Soccer" },
  { id: "game", emoji: "🎮", label: "Game controller" },
  { id: "book", emoji: "📚", label: "Books" },
  { id: "art", emoji: "🎨", label: "Art palette" },
  { id: "rocket", emoji: "🚀", label: "Rocket" },
  { id: "hundred", emoji: "💯", label: "100" },
];

export function stickerById(id: string): Sticker | undefined {
  return STICKER_PACK.find((s) => s.id === id);
}

/** A curated subset for the emoji tray's quick-pick row — inserted directly into the text draft rather than sent as a sticker message. */
export const QUICK_EMOJI: string[] = [
  "😀", "😂", "🥰", "😎", "🤔", "😢", "😮", "🙌",
  "👍", "👎", "❤️", "🔥", "🎉", "👏", "😅", "🙏",
  "💯", "✨", "😴", "🤝", "😍", "🥳", "😬", "🤯",
];
