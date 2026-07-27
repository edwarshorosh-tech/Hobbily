/**
 * Per-user AsyncStorage key builders for the locally-persisted task/reminder
 * data context/TimeContext.tsx owns. Pulled into their own module (rather
 * than each context re-deriving the string itself) so context/AuthContext.tsx
 * can purge the exact same keys on account deletion without importing
 * TimeContext directly — TimeContext itself needs useAuth(), so importing it
 * from AuthContext would be a circular module dependency.
 *
 * Every key is scoped by uid: a single generic key shared by every account
 * on a device meant a second account signing in on the same phone saw (and
 * could silently overwrite) the previous account's tasks. Scoping by uid is
 * what actually fixes that.
 */

export function tasksStorageKey(uid: string): string {
  return `@hobbily_tasks_${uid}`;
}

export function dailyReminderStorageKey(uid: string): string {
  return `@hobbily_daily_reminder_${uid}`;
}

export function reminderShownStorageKey(uid: string): string {
  return `@hobbily_reminder_shown_date_${uid}`;
}

export function notifiedTasksStorageKey(uid: string): string {
  return `@hobbily_notified_tasks_${uid}`;
}

/**
 * Pre-fix keys, shared by every account that was ever signed in on a given
 * device — used only to migrate an existing install's data to whichever
 * account first loads after this fix ships (see TimeContext's
 * migrateLegacyKey), so upgrading doesn't look like every task silently
 * vanished. Never written to again once migrated.
 */
export const LEGACY_TASKS_KEY = "@hobbily_tasks";
export const LEGACY_REMINDER_KEY = "@hobbily_daily_reminder";
export const LEGACY_REMINDER_SHOWN_KEY = "@hobbily_reminder_shown_date";
export const LEGACY_NOTIFIED_KEY = "@hobbily_notified_tasks";
