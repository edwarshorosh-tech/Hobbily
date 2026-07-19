/**
 * huggingFace — the only place this Worker talks to Hugging Face.
 *
 * Uses the official `@huggingface/inference` package with Inference
 * Providers, pointed at the exact model + provider this feature requires.
 * Never silently substitutes a different model: if this pair is unavailable,
 * the caller gets a controlled `service_unavailable` error (see errors.ts)
 * instead of a response from an unrequested model.
 */
import { InferenceClient } from "@huggingface/inference";
import { WorkerError } from "./errors";

const MODEL = "DavidAU/Qwen3-4B-Thinking-2507-Gemini-2.5-Flash-Lite-Preview-Distill-Heretic-Abliterated";
const PROVIDER = "featherless-ai";

export async function runCalendarInference(hfToken: string, systemPrompt: string, userText: string): Promise<string> {
  const client = new InferenceClient(hfToken);

  let content: string | undefined;
  try {
    const result = await client.chatCompletion({
      model: MODEL,
      provider: PROVIDER,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_tokens: 400,
      temperature: 0.2,
    });
    content = result.choices?.[0]?.message?.content ?? undefined;
  } catch {
    // Covers model/provider unavailable, rate limits, and any transport
    // failure — all surface as the same controlled, user-safe error.
    throw new WorkerError("service_unavailable", "The AI assistant is temporarily unavailable. Please try again in a moment.");
  }

  if (!content) {
    throw new WorkerError("service_unavailable", "The AI assistant is temporarily unavailable. Please try again in a moment.");
  }
  return content;
}
