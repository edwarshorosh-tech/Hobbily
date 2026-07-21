/**
 * Pure scoring logic for the Hidden Hobbies Quiz — extracted from app/quiz.tsx
 * so the archetype/tie-break rules are independently unit-testable (no
 * Firebase imports, no React) and so "same 15 answers always produce the
 * same result" is something a test can actually assert, not just a comment.
 */

export type Letter = "A" | "B" | "C" | "D";

/** The six finer-grained subjects the connectivity breakdown is scored against. */
export type Subject =
  | "Creative"
  | "Active & Sporty"
  | "Curious & STEM"
  | "Nature & Adventure"
  | "Social & Leadership"
  | "Performing Arts & Expression";

export const SUBJECTS: Subject[] = [
  "Creative",
  "Active & Sporty",
  "Curious & STEM",
  "Nature & Adventure",
  "Social & Leadership",
  "Performing Arts & Expression",
];

export type SubjectWeights = Partial<Record<Subject, number>>;

export type Question = { prompt: string; options: { letter: Letter; label: string; subjects: SubjectWeights }[] };

/**
 * Every question's options are written in fixed A/B/C/D archetype order. A and C
 * map straight to their subject; B (Athlete/Adventurer) and D (Performer/Connector)
 * each cover two of the six subjects, so their per-question flavor decides which
 * one earns the point — a question like "Sports and adventures" splits evenly.
 */
function q(
  prompt: string,
  a: string,
  b: string, bSub: Subject | [Subject, Subject],
  c: string,
  d: string, dSub: Subject | [Subject, Subject]
): Question {
  const weights = (sub: Subject | [Subject, Subject]): SubjectWeights =>
    Array.isArray(sub) ? { [sub[0]]: 0.5, [sub[1]]: 0.5 } : { [sub]: 1 };

  return {
    prompt,
    options: [
      { letter: "A", label: a, subjects: { Creative: 1 } },
      { letter: "B", label: b, subjects: weights(bSub) },
      { letter: "C", label: c, subjects: { "Curious & STEM": 1 } },
      { letter: "D", label: d, subjects: weights(dSub) },
    ],
  };
}

export const QUESTIONS: Question[] = [
  q("You have to stay in an empty room for one week. Only food and water are provided, but you can bring one item. What do you take?", "A sketchbook and pencils", "A basketball", "Active & Sporty", "A laptop with no internet", "A guitar", "Performing Arts & Expression"),
  q("You suddenly have an entire free Saturday with no responsibilities. What are you most excited to do?", "Create something", "Go outside and explore", "Nature & Adventure", "Learn a new skill", "Meet up with friends", "Social & Leadership"),
  q("A mysterious portal appears. Where do you hope it leads?", "A huge art studio", "A mountain adventure", "Nature & Adventure", "A futuristic science lab", "A concert stage", "Performing Arts & Expression"),
  q("Your school announces a surprise competition. Which one do you join?", "Photography Contest", "Sports Tournament", "Active & Sporty", "Robotics Challenge", "Talent Show", "Performing Arts & Expression"),
  q("Your phone disappears for the whole weekend. How do you spend your time?", "Drawing or creating", "Playing sports", "Active & Sporty", "Building or experimenting", "Hanging out with friends", "Social & Leadership"),
  q("Which compliment would make you happiest?", "“You're incredibly creative.”", "“You're so determined.”", "Active & Sporty", "“You're really smart.”", "“You inspire people.”", "Social & Leadership"),
  q("You receive $500 that you must spend on one hobby. What do you buy?", "Art supplies", "Sports equipment", "Active & Sporty", "A coding or robotics kit", "A musical instrument", "Performing Arts & Expression"),
  q("Which challenge sounds the most exciting?", "Paint a giant mural", "Complete a difficult hiking trail", "Nature & Adventure", "Build your own app or game", "Perform on stage", "Performing Arts & Expression"),
  q("If you could instantly master one skill, which would you choose?", "Drawing", "Any sport", "Active & Sporty", "Programming", "Singing or acting", "Performing Arts & Expression"),
  q("Which place would you love spending every afternoon?", "An art studio", "A sports center", "Active & Sporty", "A makerspace or science lab", "A music studio", "Performing Arts & Expression"),
  q("Your dream weekend looks like…", "Creating something amazing", "Going on an outdoor adventure", "Nature & Adventure", "Learning something fascinating", "Sharing experiences with people", "Social & Leadership"),
  q("Your friends need help with a project. What's your role?", "The creative thinker", "The energetic motivator", "Active & Sporty", "The problem solver", "The leader", "Social & Leadership"),
  q("Which type of videos could you watch for hours?", "Art and DIY", "Sports and adventures", ["Active & Sporty", "Nature & Adventure"], "Science and technology", "Music and performances", "Performing Arts & Expression"),
  q("If your school let you start any club, which would you choose?", "Art & Design Club", "Adventure & Sports Club", ["Nature & Adventure", "Active & Sporty"], "Robotics & Innovation Club", "Music & Performance Club", "Performing Arts & Expression"),
  q("One year from now, what would make you the proudest?", "I created something unique.", "I became stronger and healthier.", "Active & Sporty", "I mastered a difficult skill.", "I found a hobby I truly love.", ["Social & Leadership", "Performing Arts & Expression"]),
];

/** Sums each answer's subject weights (every option's weights sum to 1, so totals sum to 15). */
export function computeSubjectScores(answers: Letter[]): Record<Subject, number> {
  const totals = Object.fromEntries(SUBJECTS.map((s) => [s, 0])) as Record<Subject, number>;
  answers.forEach((letter, i) => {
    const option = QUESTIONS[i].options.find((o) => o.letter === letter)!;
    (Object.entries(option.subjects) as [Subject, number][]).forEach(([subject, weight]) => {
      totals[subject] += weight;
    });
  });
  return totals;
}

// ── Archetypes ────────────────────────────────────────────────────────────────

export type Archetype = {
  title: string;
  description: string;
  icon: string;
  color: string;
  /** Category to pre-filter on the Explore tab. */
  category: string;
};

export const ARCHETYPES: Record<Letter, Archetype> = {
  A: {
    title: "The Creator",
    description: "You think in images, colors, and ideas nobody else has thought of yet. Whether it's sketching, photography, or DIY builds, you turn imagination into something real — keep making things only you could make.",
    icon: "color-palette-outline",
    color: "#F97316",
    category: "Drawing & Art",
  },
  B: {
    title: "The Athlete / Adventurer",
    description: "You're wired for movement and momentum, always chasing the next challenge, trail, or personal best. Your energy and grit are your superpower — channel them into a sport or adventure that pushes you further.",
    icon: "trophy-outline",
    color: "#22C55E",
    category: "Sports",
  },
  C: {
    title: "The Innovator / Techie",
    description: "You love figuring out how things work — and then figuring out how to make them work better. Coding, robotics, and problem-solving are your playground; every bug and puzzle is just a challenge waiting to be cracked.",
    icon: "hardware-chip-outline",
    color: "#3B82F6",
    category: "Coding",
  },
  D: {
    title: "The Performer / Connector",
    description: "You light up a room and bring people together, whether it's on a stage or in a group project. Music, drama, and leadership let you turn your voice — and your energy — into something everyone can share.",
    icon: "musical-notes-outline",
    color: "#EC4899",
    category: "Music",
  },
};

/** Blend names for a perfect two-way tie, keyed by the tied letters sorted alphabetically. */
export const HYBRID_NAMES: Record<string, { title: string; description: string }> = {
  AB: { title: "The Creative Adventurer", description: "Part maker, part thrill-seeker — you want to build things and get outside doing them. Look for hobbies that combine hands-on making with movement, like outdoor photography or gear design." },
  AC: { title: "The Creative Innovator", description: "You blend imagination with logic — equally happy sketching a design or coding one. Hobbies that mix art and tech, like game design or digital art, are your sweet spot." },
  AD: { title: "The Creative Performer", description: "You want to make things and share them with an audience. Hobbies like music production, theater design, or content creation let you create and perform at once." },
  BC: { title: "The Adventurous Innovator", description: "You want to build and test things in the real world, not just on paper. Robotics competitions, engineering challenges, or outdoor tech projects fit you well." },
  BD: { title: "The Dynamic Connector", description: "You bring energy and people together, on a field or in a room. Team sports, group fitness, or leadership-driven clubs let you move and lead at the same time." },
  CD: { title: "The Innovative Performer", description: "You're sharp and expressive — happy solving a hard problem or holding a stage. Hobbies like music tech, esports commentary, or STEM leadership fit your mix." },
};

export type Result = {
  hybrid: boolean;
  /** Stable id persisted to the profile — a single letter for an outright winner, or the sorted tied-letter pair for a hybrid, or "renaissance" for a 3+-way tie. Never the free-text title, which can be edited/retranslated later without invalidating stored results. */
  typeId: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: string;
};

const ALL_LETTERS: Letter[] = ["A", "B", "C", "D"];

/**
 * Tally A/B/C/D points 1-for-1 per answer. A single top score wins outright.
 * A perfect tie is broken by the Q15 answer if it's one of the tied categories;
 * otherwise a two-way tie gets a hybrid archetype name, and 3+-way ties fall
 * back to a generic "renaissance" result. Purely a function of `answers` — the
 * same 15 answers always produce the same Result, with no hidden state or
 * randomness (see __tests__/quizScoring.test.ts).
 */
export function computeResult(answers: Letter[]): Result {
  const scores: Record<Letter, number> = { A: 0, B: 0, C: 0, D: 0 };
  answers.forEach((letter) => { scores[letter] += 1; });

  const maxScore = Math.max(...ALL_LETTERS.map((l) => scores[l]));
  const tied = ALL_LETTERS.filter((l) => scores[l] === maxScore);

  if (tied.length === 1) {
    const a = ARCHETYPES[tied[0]];
    return { hybrid: false, typeId: tied[0], title: a.title, description: a.description, icon: a.icon, color: a.color, category: a.category };
  }

  const q15Answer = answers[14];
  if (tied.includes(q15Answer)) {
    const a = ARCHETYPES[q15Answer];
    return { hybrid: false, typeId: q15Answer, title: a.title, description: a.description, icon: a.icon, color: a.color, category: a.category };
  }

  if (tied.length === 2) {
    const key = [...tied].sort().join("");
    const hybrid = HYBRID_NAMES[key];
    const primary = ARCHETYPES[tied[0]];
    return { hybrid: true, typeId: key, title: hybrid.title, description: hybrid.description, icon: "shuffle-outline", color: primary.color, category: primary.category };
  }

  return {
    hybrid: true,
    typeId: "renaissance",
    title: "The Renaissance Explorer",
    description: "You've got creativity, drive, curiosity, and charisma all at once. You haven't landed on one lane yet — and that's exactly what this quiz is for. Try something from a few different worlds and see what sticks.",
    icon: "planet-outline",
    color: "#8B5CF6",
    category: ARCHETYPES[tied[0]].category,
  };
}
