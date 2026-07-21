import { computeResult, computeSubjectScores, QUESTIONS, Letter } from "../utils/quizScoring";

function answers(letter: Letter, count = QUESTIONS.length): Letter[] {
  return Array(count).fill(letter);
}

describe("computeResult", () => {
  it("is deterministic — the same 15 answers always produce the same result", () => {
    const a1 = ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C"] as Letter[];
    const r1 = computeResult(a1);
    const r2 = computeResult([...a1]);
    expect(r1).toEqual(r2);
  });

  it("an outright winner (all A) returns The Creator, not a hybrid", () => {
    const result = computeResult(answers("A"));
    expect(result.hybrid).toBe(false);
    expect(result.typeId).toBe("A");
    expect(result.title).toBe("The Creator");
  });

  it("a perfect tie is broken by the 15th answer when it's one of the tied letters", () => {
    // 7 A, 7 B (alternating for 14 questions), then Q15 = B, so B should win outright.
    const alt: Letter[] = [];
    for (let i = 0; i < 14; i++) alt.push(i % 2 === 0 ? "A" : "B");
    alt.push("B");
    const result = computeResult(alt);
    expect(result.hybrid).toBe(false);
    expect(result.typeId).toBe("B");
  });

  it("a two-way tie not resolved by Q15 returns a stable hybrid id (sorted letter pair)", () => {
    // 7 A, 7 C alternating, Q15 = D (not part of the A/C tie) forces a hybrid.
    const alt: Letter[] = [];
    for (let i = 0; i < 14; i++) alt.push(i % 2 === 0 ? "A" : "C");
    alt.push("D");
    const result = computeResult(alt);
    expect(result.hybrid).toBe(true);
    expect(result.typeId).toBe("AC");
    expect(result.title).toBe("The Creative Innovator");
  });
});

describe("computeSubjectScores", () => {
  it("all-A answers put every point into Creative", () => {
    const scores = computeSubjectScores(answers("A"));
    expect(scores["Creative"]).toBe(QUESTIONS.length);
    expect(scores["Curious & STEM"]).toBe(0);
  });

  it("scores across all six subjects always sum to the question count (every option's weights sum to 1)", () => {
    for (const letter of ["A", "B", "C", "D"] as Letter[]) {
      const scores = computeSubjectScores(answers(letter));
      const total = Object.values(scores).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(QUESTIONS.length, 5);
    }
  });
});
