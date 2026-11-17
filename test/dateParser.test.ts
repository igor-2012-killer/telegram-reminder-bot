import { test } from "node:test";
import assert from "node:assert/strict";
import { DateParser, InvalidRecurrenceIntervalError } from "../src/services/dateParser";

const ref = new Date("2026-06-15T08:00:00Z");
const tz = "Europe/Moscow";

test("parses a one-off reminder", () => {
    const result = DateParser.parse("через 20 минут выключить духовку", tz, ref);
    assert.ok(result);
    assert.equal(result.isRecurring, false);
    assert.equal(result.cleanText, "выключить духовку");
    assert.equal(result.date.toISOString(), "2026-06-15T08:20:00.000Z");
});

test("keeps a valid English interval", () => {
    const result = DateParser.parse("every 2 days at 10:00 buy milk", tz, ref);
    assert.ok(result);
    assert.equal(result.isRecurring, true);
    assert.equal(result.recurrenceRule, "RRULE:FREQ=DAILY;INTERVAL=2");
});

test("leaves a chrono-consumed Russian interval as a one-off reminder", () => {
    const result = DateParser.parse("каждые 3 дня в 10:00 тест", tz, ref);
    assert.ok(result);
    assert.equal(result.isRecurring, false);
    assert.equal(result.recurrenceRule, undefined);
});

test("keeps a valid Russian interval when the number is still in the text", () => {
    const result = DateParser.parse("в 10:00 каждые 3 дня тест", tz, ref);
    assert.ok(result);
    assert.equal(result.isRecurring, true);
    assert.equal(result.recurrenceRule, "RRULE:FREQ=DAILY;INTERVAL=3");
});

test("rejects a zero day interval", () => {
    assert.throws(
        () => DateParser.parse("every 0 days at 10:00 test", tz, ref),
        InvalidRecurrenceIntervalError,
    );
});

test("rejects a zero week interval", () => {
    assert.throws(
        () => DateParser.parse("at 10:00 every 0 weeks test", tz, ref),
        InvalidRecurrenceIntervalError,
    );
});

test("rejects a Russian zero interval even when chrono consumes the number", () => {
    assert.throws(
        () => DateParser.parse("каждые 0 дней в 10:00 тест", tz, ref),
        InvalidRecurrenceIntervalError,
    );
});

test("rejects an absurd interval", () => {
    assert.throws(
        () => DateParser.parse("every 1000 days at 10:00 test", tz, ref),
        InvalidRecurrenceIntervalError,
    );
    assert.throws(
        () => DateParser.parse("в 10:00 каждые 1000 дней тест", tz, ref),
        InvalidRecurrenceIntervalError,
    );
});
