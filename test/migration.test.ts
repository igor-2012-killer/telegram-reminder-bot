import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { CHAT_ID_MIGRATION, INIT_MIGRATION, planBaseline } from "../scripts/migrate";

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
    db.prepare("INSERT INTO Reminder (userId, message, triggerAt) VALUES (?, ?, ?)").run(
        42,
        "buy milk",
        "2026-01-01T00:00:00.000Z",
    );

    const before = db.prepare("PRAGMA table_info(Reminder)").all() as Array<{ name: string }>;
    assert.equal(
        before.some((column) => column.name === "chatId"),
        false,
    );

    db.exec(readMigration("20261117120000_add_reminder_chat_id"));
    const row = db.prepare("SELECT chatId, userId FROM Reminder").get() as {
        chatId: bigint | number;
        userId: bigint | number;
    };
    assert.equal(String(row.chatId), "42");
    assert.equal(String(row.userId), "42");
    db.close();
    fs.rmSync(dbFile, { force: true });
});

test("an existing chatId is left untouched", () => {
    const dbFile = path.join(os.tmpdir(), `reminder-migrate-keep-${process.pid}.db`);
    fs.rmSync(dbFile, { force: true });
    const db = new Database(dbFile);
    db.exec(readMigration("20260117132119_init"));
    db.exec("ALTER TABLE Reminder ADD COLUMN chatId BIGINT");
    db.prepare("INSERT INTO User (id, timezone) VALUES (?, ?)").run(42, "Europe/Moscow");
    db.prepare("INSERT INTO Reminder (userId, chatId, message, triggerAt) VALUES (?, ?, ?, ?)").run(
        42,
        -100123,
        "group reminder",
        "2026-01-01T00:00:00.000Z",
    );

    assert.throws(() => db.exec(readMigration("20261117120000_add_reminder_chat_id")));
    const row = db.prepare("SELECT chatId, message FROM Reminder").get() as {
        chatId: bigint | number;
        message: string;
    };
    assert.equal(String(row.chatId), "-100123");
    assert.equal(row.message, "group reminder");
    db.close();
    fs.rmSync(dbFile, { force: true });
});

test("baseline skips the chatId rebuild only when the column is already present", () => {
    assert.deepEqual(
        planBaseline({
            reminderTableExists: false,
            chatIdColumnExists: false,
            appliedMigrations: [],
        }),
        [],
    );
    assert.deepEqual(
        planBaseline({
            reminderTableExists: true,
            chatIdColumnExists: false,
            appliedMigrations: [],
        }),
        [INIT_MIGRATION],
    );
    assert.deepEqual(
        planBaseline({
            reminderTableExists: true,
            chatIdColumnExists: false,
            appliedMigrations: [INIT_MIGRATION],
        }),
        [],
    );
    assert.deepEqual(
        planBaseline({
            reminderTableExists: true,
            chatIdColumnExists: true,
            appliedMigrations: [],
        }),
        [INIT_MIGRATION, CHAT_ID_MIGRATION],
    );
    assert.deepEqual(
        planBaseline({
            reminderTableExists: true,
            chatIdColumnExists: true,
            appliedMigrations: [INIT_MIGRATION, CHAT_ID_MIGRATION],
        }),
        [],
    );
});

test("migration history has no drift from schema.prisma", () => {
    const result = spawnSync(
        "npx",
        [
            "prisma",
            "migrate",
            "diff",
            "--from-migrations",
            "prisma/migrations",
            "--to-schema",
            "prisma/schema.prisma",
            "--exit-code",
        ],
        {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, DATABASE_URL: "file:/tmp/reminder-migdiff.db" },
        },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
