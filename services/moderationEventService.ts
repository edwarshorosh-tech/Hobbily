/**
 * moderationEventService — persists a high/critical moderation hit
 * (services/moderationService.ts's shouldLogModerationEvent) to
 * moderationEvents/{id}. Never stores the raw offending text — only the
 * category/severity/where-it-happened, matching the spec this implements
 * ("Не сохраняй raw запрещённый текст без крайней необходимости"). Write-
 * only from the client by design (see firestore.rules: create-only, no
 * read/update/delete) — this is the "protected table with limited access"
 * the spec calls for, given this project has no backend/admin console to
 * grant broader read access to yet.
 */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ModerationCategory, ModerationSeverity, MODERATION_RULESET_VERSION } from "../types/Moderation";

const MODERATION_EVENTS = "moderationEvents";

export async function recordModerationEvent(params: {
  userId: string;
  surface: string;
  entityId?: string;
  category: ModerationCategory;
  severity: ModerationSeverity;
}): Promise<void> {
  try {
    await addDoc(collection(db, MODERATION_EVENTS), {
      userId: params.userId,
      surface: params.surface,
      entityId: params.entityId ?? null,
      category: params.category,
      severity: params.severity,
      ruleVersion: MODERATION_RULESET_VERSION,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Logging a moderation event must never be what makes a blocked save
    // fail loudly for the user — the save was already rejected by
    // checkText() before this is even called; this is best-effort telemetry
    // on top of that, not a gate.
    if (__DEV__) console.warn("[moderationEventService] failed to record event", e);
  }
}
