import {
  reportPriority,
  USER_REPORT_REASONS,
  USER_REPORT_REASON_LABELS,
  MAX_REPORT_DESCRIPTION_LENGTH,
} from "../types/UserReport";
import { reportDocId } from "../utils/userReportId";

describe("reportPriority", () => {
  it("is critical for underage safety concerns", () => {
    expect(reportPriority("underage_safety_concern")).toBe("critical");
  });

  it("is high for threats, sexual content, and sharing personal information", () => {
    expect(reportPriority("threats_or_violence")).toBe("high");
    expect(reportPriority("sexual_content")).toBe("high");
    expect(reportPriority("sharing_personal_information")).toBe("high");
  });

  it("is normal for ordinary reasons", () => {
    expect(reportPriority("spam_or_scam")).toBe("normal");
    expect(reportPriority("other")).toBe("normal");
  });

  it("never returns a priority for every reason other than normal/high/critical", () => {
    for (const reason of USER_REPORT_REASONS) {
      expect(["normal", "high", "critical"]).toContain(reportPriority(reason));
    }
  });
});

describe("USER_REPORT_REASON_LABELS", () => {
  it("has a label and description for every reason in USER_REPORT_REASONS", () => {
    for (const reason of USER_REPORT_REASONS) {
      expect(USER_REPORT_REASON_LABELS[reason].label.length).toBeGreaterThan(0);
      expect(USER_REPORT_REASON_LABELS[reason].description.length).toBeGreaterThan(0);
    }
  });

  it("never mentions being banned or an investigation outcome in any reason description", () => {
    for (const reason of USER_REPORT_REASONS) {
      const text = USER_REPORT_REASON_LABELS[reason].description.toLowerCase();
      expect(text).not.toMatch(/banned|investigat/);
    }
  });
});

describe("reportDocId", () => {
  it("is deterministic for the same inputs", () => {
    const a = reportDocId("reporter1", "reported1", "spam_or_scam", null);
    const b = reportDocId("reporter1", "reported1", "spam_or_scam", null);
    expect(a).toBe(b);
  });

  it("differs when the reason differs", () => {
    const a = reportDocId("reporter1", "reported1", "spam_or_scam");
    const b = reportDocId("reporter1", "reported1", "hate_speech");
    expect(a).not.toBe(b);
  });

  it("differs when the related entity differs", () => {
    const a = reportDocId("reporter1", "reported1", "harassment_or_bullying", "message123");
    const b = reportDocId("reporter1", "reported1", "harassment_or_bullying", "message456");
    expect(a).not.toBe(b);
  });

  it("defaults the entity segment to 'profile' when none is given", () => {
    expect(reportDocId("r1", "r2", "other")).toBe("r1_r2_other_profile");
  });
});

describe("MAX_REPORT_DESCRIPTION_LENGTH", () => {
  it("matches the spec's 500-character limit", () => {
    expect(MAX_REPORT_DESCRIPTION_LENGTH).toBe(500);
  });
});
