import { mvpRegistrationNoticeCopy } from "../utils/mvpNotice";
import { FEATURE_FLAGS } from "../constants/featureFlags";

describe("mvpRegistrationNoticeCopy", () => {
  it("has a 'Coming soon' title regardless of kind", () => {
    expect(mvpRegistrationNoticeCopy("register").title).toBe("Coming soon");
    expect(mvpRegistrationNoticeCopy("interest").title).toBe("Coming soon");
  });

  it("defaults to the register-kind message", () => {
    expect(mvpRegistrationNoticeCopy().message).toMatch(/registration is not available/i);
  });

  it("uses distinct copy for the interest-registration kind", () => {
    expect(mvpRegistrationNoticeCopy("interest").message).toMatch(/interest registration is not available/i);
  });

  it("never claims the user is registered", () => {
    for (const kind of ["register", "interest"] as const) {
      const { message } = mvpRegistrationNoticeCopy(kind);
      expect(message.toLowerCase()).not.toMatch(/\byou('re| are) registered\b/);
    }
  });
});

describe("FEATURE_FLAGS", () => {
  it("exploreRegistrationEnabled is off for this MVP pass", () => {
    expect(FEATURE_FLAGS.exploreRegistrationEnabled).toBe(false);
  });
});
