import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

const root = path.resolve(__dirname, "..");

function readMigration(name: string) {
    return fs.readFileSync(path.join(root, "prisma", "migrations", name, "migration.sql"), "utf8");
}

test("adding chatId backfills private chats and matches the Prisma schema", () => {
    const dbFile = path.join(os.tmpdir(), `reminder-migrate-${process.pid}.db`);
    fs.rmSync(dbFile, { force: true });
    const db = new Database(dbFile);
    db.exec(readMigration("20260117132119_init"));
    db.prepare("INSERT INTO User (id, timezone) VALUES (?, ?)").run(42, "Europe/Moscow");
    db.prepare("INSERT INTO Reminder (userId, message, triggerAt) VALUES (?, ?, ?)").run(42, "buy milk", "2026-01-01T00:00:00.000Z");

    const before = db.prepare("PRAGMA table_info(Reminder)").all() as Array<{ name: string }>;
    assert.equal(before.some((column) => column.name === "chatId"), false);

    db.exec(readMigration("20261117120000_add_reminder_chat_id"));
    const row = db.prepare("SELECT chatId, userId FROM Reminder").get() as { chatId: bigint | number; userId: bigint | number };
    assert.equal(String(row.chatId), "42");
    assert.equal(String(row.userId), "42");
    db.close();
    fs.rmSync(dbFile, { force: true });
});

test("migration history has no drift from schema.prisma", () => {
    const result = spawnSync(
        "npx",
        ["prisma", "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"],
        {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, DATABASE_URL: "file:/tmp/reminder-migdiff.db" },
        },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
