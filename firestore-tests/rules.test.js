/**
 * Firestore Security Rules test suite for the friends feature
 * (friendships/{pairId} and publicProfiles/{uid}).
 *
 * Run against the Firestore emulator:
 *   npm run test:rules
 * (equivalent to: firebase emulators:exec --only firestore "node firestore-tests/rules.test.js")
 *
 * Requires the @firebase/rules-unit-testing devDependency and a local Java
 * runtime (the Firestore emulator itself is a JVM process) — see the README
 * note in the final implementation summary if the emulator can't start.
 */
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc, updateDoc, serverTimestamp } = require("firebase/firestore");

const PROJECT_ID = "hobbily-rules-test";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✘ ${name}`);
    console.error(`    ${e.message}`);
  }
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  const uidA = "alice";
  const uidB = "bob";
  const uidC = "carol";
  const uidD = "dave";
  const pairAB = "alice_bob"; // "alice" < "bob"

  // Seed a pending alice -> bob request and alice's public profile, bypassing rules.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "friendships", pairAB), {
      participants: [uidA, uidB],
      requestedBy: uidA,
      requestedTo: uidB,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      acceptedAt: null,
      declinedAt: null,
    });
    await setDoc(doc(db, "publicProfiles", uidA), {
      uid: uidA,
      username: "alice",
      usernameNormalized: "alice",
      city: "",
      avatarUrl: null,
      currentStreak: 0,
      updatedAt: serverTimestamp(),
    });
  });

  const aliceDb = testEnv.authenticatedContext(uidA).firestore();
  const bobDb = testEnv.authenticatedContext(uidB).firestore();
  const carolDb = testEnv.authenticatedContext(uidC).firestore();
  const daveDb = testEnv.authenticatedContext(uidD).firestore();
  const anonDb = testEnv.unauthenticatedContext().firestore();

  console.log("Friendships:");

  await check("unauthenticated friendship read is denied", async () => {
    await assertFails(getDoc(doc(anonDb, "friendships", pairAB)));
  });

  await check("unauthenticated friendship create is denied", async () => {
    await assertFails(
      setDoc(doc(anonDb, "friendships", "carol_dave"), {
        participants: ["carol", "dave"],
        requestedBy: "carol",
        requestedTo: "dave",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
      })
    );
  });

  await check("self-request is denied", async () => {
    await assertFails(
      setDoc(doc(carolDb, "friendships", "carol_carol"), {
        participants: [uidC, uidC],
        requestedBy: uidC,
        requestedTo: uidC,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
      })
    );
  });

  await check("valid pending request creation succeeds", async () => {
    const pairAC = uidA < uidC ? `${uidA}_${uidC}` : `${uidC}_${uidA}`;
    await assertSucceeds(
      setDoc(doc(carolDb, "friendships", pairAC), {
        participants: [uidA, uidC].sort(),
        requestedBy: uidC,
        requestedTo: uidA,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
      })
    );
  });

  await check("duplicate pending request (opposite direction) is denied", async () => {
    await assertFails(
      setDoc(doc(bobDb, "friendships", pairAB), {
        participants: [uidA, uidB],
        requestedBy: uidB,
        requestedTo: uidA,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
      })
    );
  });

  await check("acceptance by the wrong user is denied", async () => {
    await assertFails(
      updateDoc(doc(carolDb, "friendships", pairAB), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("update by an unrelated user is denied", async () => {
    await assertFails(
      updateDoc(doc(carolDb, "friendships", pairAB), {
        status: "declined",
        declinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("reading a friendship as a participant succeeds", async () => {
    await assertSucceeds(getDoc(doc(aliceDb, "friendships", pairAB)));
    await assertSucceeds(getDoc(doc(bobDb, "friendships", pairAB)));
  });

  await check("acceptance by the correct recipient succeeds", async () => {
    await assertSucceeds(
      updateDoc(doc(bobDb, "friendships", pairAB), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  console.log("Public profiles:");

  await check("public profile update by its owner succeeds", async () => {
    await assertSucceeds(
      setDoc(doc(aliceDb, "publicProfiles", uidA), {
        uid: uidA,
        username: "alice2",
        usernameNormalized: "alice2",
        city: "Metropolis",
        avatarUrl: null,
        currentStreak: 3,
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("public profile update by another user is denied", async () => {
    await assertFails(
      setDoc(doc(bobDb, "publicProfiles", uidA), {
        uid: uidA,
        username: "hacked",
        usernameNormalized: "hacked",
        city: "",
        avatarUrl: null,
        currentStreak: 999999,
        updatedAt: serverTimestamp(),
      })
    );
  });

  console.log("Progress / achievements:");

  // Seed alice's progress doc with two unlocked achievements, bypassing rules.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "progress", uidA), {
      state: {
        streakDays: [],
        totalSessions: 5,
        totalMinutes: 50,
        longestStreak: 2,
        achievements: [
          { id: "first_session", title: "First Step", description: "d", icon: "footsteps-outline", earnedAt: "2026-01-01" },
          { id: "streak_3", title: "3-Day Streak", description: "d", icon: "flame-outline", earnedAt: "2026-01-03" },
        ],
        achievementIds: ["first_session", "streak_3"],
        streakFreezeAvailable: true,
        streakFreezeLastGranted: "",
      },
      freezeUsedDate: null,
    });
  });

  await check("owner can read their own progress doc", async () => {
    await assertSucceeds(getDoc(doc(aliceDb, "progress", uidA)));
  });

  await check("another user cannot read someone else's progress doc", async () => {
    await assertFails(getDoc(doc(bobDb, "progress", uidA)));
  });

  await check("owner can grow their own achievements list", async () => {
    await assertSucceeds(
      updateDoc(doc(aliceDb, "progress", uidA), {
        "state.achievements": [
          { id: "first_session", title: "First Step", description: "d", icon: "footsteps-outline", earnedAt: "2026-01-01" },
          { id: "streak_3", title: "3-Day Streak", description: "d", icon: "flame-outline", earnedAt: "2026-01-03" },
          { id: "sessions_10", title: "Dedicated", description: "d", icon: "star-outline", earnedAt: "2026-01-10" },
        ],
        "state.achievementIds": ["first_session", "streak_3", "sessions_10"],
      })
    );
  });

  await check("owner cannot shrink their own achievements list", async () => {
    await assertFails(
      updateDoc(doc(aliceDb, "progress", uidA), {
        "state.achievements": [
          { id: "first_session", title: "First Step", description: "d", icon: "footsteps-outline", earnedAt: "2026-01-01" },
        ],
        "state.achievementIds": ["first_session"],
      })
    );
  });

  console.log("Featured achievements:");

  await check("owner can feature an achievement id they've actually unlocked", async () => {
    await assertSucceeds(
      setDoc(doc(aliceDb, "publicProfiles", uidA), {
        uid: uidA,
        username: "alice",
        usernameNormalized: "alice",
        city: "",
        avatarUrl: null,
        currentStreak: 0,
        bio: "",
        hobbies: [],
        featuredAchievementIds: ["first_session"],
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("owner cannot feature an achievement id they haven't unlocked", async () => {
    await assertFails(
      setDoc(doc(aliceDb, "publicProfiles", uidA), {
        uid: uidA,
        username: "alice",
        usernameNormalized: "alice",
        city: "",
        avatarUrl: null,
        currentStreak: 0,
        bio: "",
        hobbies: [],
        featuredAchievementIds: ["sessions_50"],
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("owner cannot feature more than 3 achievement ids", async () => {
    await assertFails(
      setDoc(doc(aliceDb, "publicProfiles", uidA), {
        uid: uidA,
        username: "alice",
        usernameNormalized: "alice",
        city: "",
        avatarUrl: null,
        currentStreak: 0,
        bio: "",
        hobbies: [],
        featuredAchievementIds: ["first_session", "streak_3", "first_session", "streak_3"],
        updatedAt: serverTimestamp(),
      })
    );
  });

  console.log("Public profile currentStreak bootstrap (avatar-upload regression):");

  // Regression coverage for the bug where a brand-new publicProfiles/{uid}
  // document could never come into existence at all: profileService.ts's
  // saveProfile()/ensurePublicProfileFresh()/updateAvatarUrl() never include
  // currentStreak (only ProgressContext.tsx's separate streak-mirror effect
  // does), and request.resource.data reflects the full post-merge document —
  // so requiring currentStreak unconditionally rejected every one of these
  // real writes on a document that didn't already have it. Each check below
  // uses the exact payload shape the real service functions send.
  await check("first-ever public profile write without currentStreak succeeds (saveProfile/ensurePublicProfileFresh's real shape)", async () => {
    await assertSucceeds(
      setDoc(
        doc(daveDb, "publicProfiles", uidD),
        {
          uid: uidD,
          username: "dave",
          usernameNormalized: "dave",
          city: "",
          avatarUrl: null,
          bio: "",
          hobbies: [],
          featuredAchievementIds: [],
          personalityTypeId: null,
          personalityTypeName: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  });

  await check("currentStreak-only merge onto that now-existing doc succeeds (ProgressContext's mirror-write shape)", async () => {
    await assertSucceeds(
      setDoc(doc(daveDb, "publicProfiles", uidD), { currentStreak: 0, updatedAt: serverTimestamp() }, { merge: true })
    );
  });

  await check("avatarUrl-only merge afterward succeeds and preserves currentStreak (updateAvatarUrl's real shape)", async () => {
    await assertSucceeds(
      setDoc(doc(daveDb, "publicProfiles", uidD), { avatarUrl: "https://example.com/avatar.jpg", updatedAt: serverTimestamp() }, { merge: true })
    );
    const snap = await getDoc(doc(daveDb, "publicProfiles", uidD));
    if (snap.data().avatarUrl !== "https://example.com/avatar.jpg") throw new Error("avatarUrl was not persisted");
    if (snap.data().currentStreak !== 0) throw new Error("currentStreak was lost by the merge");
  });

  await check("an invalid currentStreak value is still rejected when present", async () => {
    await assertFails(
      setDoc(doc(daveDb, "publicProfiles", uidD), { currentStreak: -1, updatedAt: serverTimestamp() }, { merge: true })
    );
  });

  await testEnv.cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
