import { WORKER_CODE_MAP, describeAiWorkerEndpoint, isAiWorkerConfigured } from "../utils/aiAssistantConfig";

describe("isAiWorkerConfigured", () => {
  it("is false for an empty string (the real process.env.EXPO_PUBLIC_AI_WORKER_URL ?? \"\" shape when .env is missing)", () => {
    expect(isAiWorkerConfigured("")).toBe(false);
  });

  it("is false for a whitespace-only value", () => {
    expect(isAiWorkerConfigured("   ")).toBe(false);
  });

  it("is true once a real URL is set", () => {
    expect(isAiWorkerConfigured("https://hobbily-ai-worker.example.workers.dev/chat")).toBe(true);
  });
});

describe("describeAiWorkerEndpoint", () => {
  it("reports not configured when the URL is missing", () => {
    expect(describeAiWorkerEndpoint("")).toEqual({ configured: false });
  });

  it("reports not configured for a malformed URL rather than throwing", () => {
    expect(describeAiWorkerEndpoint("not a url")).toEqual({ configured: false });
  });

  it("reports hostname and protocol for a valid URL", () => {
    const result = describeAiWorkerEndpoint("https://hobbily-ai-worker.example.workers.dev/chat");
    expect(result).toEqual({ configured: true, hostname: "hobbily-ai-worker.example.workers.dev", protocol: "https" });
  });

  it("never includes the path, query string, or full URL in its output (development diagnostics must not leak deployment-specific details)", () => {
    const secretish = "https://hobbily-ai-worker.example.workers.dev/chat?token=super-secret-value";
    const result = describeAiWorkerEndpoint(secretish);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).not.toContain("/chat");
    expect(serialized).not.toContain(secretish);
  });
});

describe("WORKER_CODE_MAP", () => {
  it("maps every real Worker error code (worker/src/errors.ts) to its client-side equivalent", () => {
    expect(WORKER_CODE_MAP.invalid_request).toBe("invalid-request");
    expect(WORKER_CODE_MAP.unauthenticated).toBe("unauthenticated");
    expect(WORKER_CODE_MAP.invalid_result).toBe("invalid-result");
    expect(WORKER_CODE_MAP.service_unavailable).toBe("service-unavailable");
    expect(WORKER_CODE_MAP.unknown).toBe("unknown");
  });
});
