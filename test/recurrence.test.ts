import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, parseRecurrenceInterval, recurrenceRuleIsSafe } from "../src/services/recurrence";

test("rejects zero and out-of-range intervals", () => {
    assert.equal(parseRecurrenceInterval("0"), null);
    assert.equal(parseRecurrenceInterval("00"), null);
    assert.equal(parseRecurrenceInterval("1000"), null);
    assert.equal(parseRecurrenceInterval("2"), 2);
    assert.equal(parseRecurrenceInterval("999"), 999);
});

test("treats INTERVAL=0 as unsafe and returns immediately", () => {
    assert.equal(recurrenceRuleIsSafe("RRULE:FREQ=DAILY;INTERVAL=0"), false);
    const started = Date.now();
    const next = nextOccurrence(
        "RRULE:FREQ=DAILY;INTERVAL=0",
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-06-15T00:00:00Z"),
        "UTC",
    );
    assert.equal(next, null);
    assert.ok(Date.now() - started < 1000);
});

test("rejects an absurd stored interval without iterating it", () => {
    assert.equal(recurrenceRuleIsSafe("RRULE:FREQ=WEEKLY;INTERVAL=1000"), false);
    assert.equal(nextOccurrence("RRULE:FREQ=WEEKLY;INTERVAL=5000", new Date(), new Date(), "UTC"), null);
});

test("advances a safe RRULE and the built-in daily rule", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const rruleNext = nextOccurrence("RRULE:FREQ=DAILY;INTERVAL=2", now, now, "UTC");
    assert.ok(rruleNext);
    assert.ok(rruleNext.getTime() > now.getTime());

    const dailyNext = nextOccurrence("daily", new Date("2026-06-14T12:00:00Z"), now, "UTC");
    assert.ok(dailyNext);
    assert.ok(dailyNext.getTime() > now.getTime());
});

test("stops an unknown rule instead of repeating the same instant", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    assert.equal(nextOccurrence("every 0 seconds", new Date("2026-06-14T12:00:00Z"), now, "UTC"), null);
});
