import fs from "fs";
import path from "path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(__dirname, "..", "src");

/** Scheduler may update a row by id. Every other caller uses reminderAccess.ts. */
const allowed = new Set(["services/reminderAccess.ts", "services/scheduler.ts"]);

/**
 * Id-scoped Reminder operations. findMany, create, and count are intentionally
 * not listed: list/create in src/bot/index.ts already set chatId, and count is
 * not a row read by id. Keep this list aligned with eslint.config.mjs.
 */
const BANNED_METHODS = [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "update",
    "delete",
    "updateMany",
    "deleteMany",
    "upsert",
];

const bannedSource = String.raw`prisma\s*(?:\?\.|\.)\s*reminder\s*(?:\?\.|\.)\s*(?:${BANNED_METHODS.join("|")})\s*(?:\?\.|\.)?\s*\(`;

const RULE = "reminder-access";

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
    });
}

function lineViolations(rel: string, text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(new RegExp(bannedSource, "g"))) {
        const line = text.slice(0, match.index ?? 0).split("\n").length;
        found.push(`${rel}:${line}`);
    }
    return found;
}

test("user-facing Reminder reads and writes go through reminderAccess", () => {
    const violations: string[] = [];
    for (const file of walk(root)) {
        if (!file.endsWith(".ts")) continue;
        const rel = path.relative(root, file).split(path.sep).join("/");
        if (allowed.has(rel)) continue;
        violations.push(...lineViolations(rel, fs.readFileSync(file, "utf8")));
    }

    assert.deepEqual(
        violations,
        [],
        [
            `${RULE}: do not read or mutate Reminder rows with prisma.reminder outside reminderAccess.ts and the scheduler.`,
            "Use the helpers in reminderAccess.ts (reminderInChat, findReminderInChat, updateReminderInChat, deleteReminderInChat).",
            violations.length > 0 ? `Violations: ${violations.join(", ")}.` : "",
        ]
            .filter(Boolean)
            .join(" "),
    );
});
