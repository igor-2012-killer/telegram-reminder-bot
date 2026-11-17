import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

export const INIT_MIGRATION = "20260117132119_init";
export const CHAT_ID_MIGRATION = "20261117120000_add_reminder_chat_id";

export function planBaseline(input: {
    reminderTableExists: boolean;
    chatIdColumnExists: boolean;
    appliedMigrations: readonly string[];
}): string[] {
    if (!input.reminderTableExists) return [];
    const applied = new Set(input.appliedMigrations);
    const resolveApplied: string[] = [];
    if (!applied.has(INIT_MIGRATION)) resolveApplied.push(INIT_MIGRATION);
    // The chatId rebuild copies userId over an existing destination. Skip it
    // when the column is already there; migrate deploy still adds it when absent.
    if (input.chatIdColumnExists && !applied.has(CHAT_ID_MIGRATION)) {
        resolveApplied.push(CHAT_ID_MIGRATION);
    }
    return resolveApplied;
}

function databaseFile(): string | null {
    const url = process.env.DATABASE_URL || "";
    if (!url.startsWith("file:")) {
        throw new Error("DATABASE_URL must be a sqlite file: URL");
    }
    const file = url.replace(/^file:/, "");
    return fs.existsSync(file) ? file : null;
}

function tableExists(db: Database.Database, table: string): boolean {
    return Boolean(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
    );
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
    return columns.some((entry) => entry.name === column);
}

function appliedMigrations(db: Database.Database): string[] {
    if (!tableExists(db, "_prisma_migrations")) return [];
    const rows = db
        .prepare(
            "SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
        )
        .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
}

function failedMigrations(db: Database.Database): string[] {
    if (!tableExists(db, "_prisma_migrations")) return [];
    const rows = db
        .prepare(
            "SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL",
        )
        .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
}

function prisma(args: string[]) {
    const result = spawnSync("npx", ["prisma", ...args], {
        stdio: "inherit",
        env: process.env,
        cwd: path.resolve(__dirname, ".."),
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function main() {
    const file = databaseFile();
    if (file) {
        const db = new Database(file);
        const reminderTableExists = tableExists(db, "Reminder");
        const chatIdColumnExists = reminderTableExists && columnExists(db, "Reminder", "chatId");
        const applied = appliedMigrations(db);
        const failed = failedMigrations(db);
        db.close();

        if (chatIdColumnExists) {
            for (const name of failed) {
                if (name === CHAT_ID_MIGRATION) {
                    prisma(["migrate", "resolve", "--rolled-back", name]);
                }
            }
        }

        for (const name of planBaseline({
            reminderTableExists,
            chatIdColumnExists,
            appliedMigrations: applied,
        })) {
            prisma(["migrate", "resolve", "--applied", name]);
        }
    }

    prisma(["migrate", "deploy"]);
}

if (require.main === module) {
    main();
}
