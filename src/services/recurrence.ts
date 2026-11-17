import { DateTime } from "luxon";
import { RRule } from "rrule";

/** Inclusive bounds for a user-supplied "every N days/weeks" interval. */
export const MIN_RECURRENCE_INTERVAL = 1;
export const MAX_RECURRENCE_INTERVAL = 999;

const SIMPLE_RULES = new Set(["daily", "weekly", "every week"]);
const MAX_SIMPLE_STEPS = 10000;

/**
 * Accepts a whole number in [1, 999]. Zero and larger values are rejected
 * because INTERVAL=0 does not advance a recurrence and huge intervals are not useful.
 */
export function parseRecurrenceInterval(raw: string): number | null {
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isInteger(value)) return null;
    if (value < MIN_RECURRENCE_INTERVAL || value > MAX_RECURRENCE_INTERVAL) return null;
    return value;
}

export function recurrenceRuleIsSafe(rule: string): boolean {
    if (SIMPLE_RULES.has(rule)) return true;
    if (!rule.startsWith("RRULE:")) return false;

    const match = /(?:^|;)INTERVAL=([^;]*)/i.exec(rule);
    if (!match) return true;
    return parseRecurrenceInterval(match[1]) !== null;
}

/**
 * Next fire time strictly after `now`, or null when the rule is finished or unsafe.
 * Unsafe rules (INTERVAL=0, unknown patterns) return null without iterating.
 */
export function nextOccurrence(rule: string, triggerAt: Date, now: Date, timezone: string): Date | null {
    if (!recurrenceRuleIsSafe(rule)) return null;

    if (rule.startsWith("RRULE:")) {
        try {
            const next = RRule.fromString(rule).after(now);
            if (!next || next.getTime() <= now.getTime()) return null;
            return next;
        } catch {
            return null;
        }
    }

    let cursor = DateTime.fromJSDate(triggerAt).setZone(timezone);
    const nowZoned = DateTime.fromJSDate(now).setZone(timezone);
    if (!cursor.isValid || !nowZoned.isValid) return null;

    for (let step = 0; step < MAX_SIMPLE_STEPS && cursor <= nowZoned; step++) {
        if (rule === "daily") {
            cursor = cursor.plus({ days: 1 });
        } else if (rule === "weekly" || rule === "every week") {
            cursor = cursor.plus({ weeks: 1 });
        } else {
            return null;
        }
    }

    if (cursor <= nowZoned) return null;
    return cursor.toJSDate();
}
