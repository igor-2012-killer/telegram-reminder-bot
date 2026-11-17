import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import type { Update } from "@grammyjs/types";
import type { Bot } from "grammy";
import type { PrismaClient } from "@prisma/client";
import { RATE_LIMIT_MESSAGE, UPDATE_RATE_LIMIT } from "../src/bot/limits";

const dbFile = path.join(os.tmpdir(), `reminder-bot-${process.pid}.db`);
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.BOT_TOKEN = "123456:INTEGRATION_TOKEN";
process.env.LOG_LEVEL = "silent";

type ApiCall = { method: string; payload: Record<string, any> };

let bot: Bot<any>;
let prisma: PrismaClient;
let processDueReminders: (bot: Bot<any>, now?: Date) => Promise<void>;
const calls: ApiCall[] = [];
let sendFailure: { error_code: number; description: string } | null = null;
let updateSeq = 1;
const nodeFetch = createRequire(__filename)("node-fetch") as { default: (...args: any[]) => Promise<any> };
const originalFetch = nodeFetch.default;

function fakeTelegramResponse(body: unknown) {
    return { ok: true, status: 200, json: async () => body };
}

function resetApi() {
    calls.length = 0;
    sendFailure = null;
}

function texts(method: string) {
    return calls.filter((call) => call.method === method).map((call) => String(call.payload.text ?? ""));
}

function baseMessage(userId: number, chatId: number, chatType: "private" | "group") {
    const id = updateSeq++;
    return {
        message_id: id,
        date: Math.floor(Date.now() / 1000),
        from: { id: userId, is_bot: false, first_name: "U" },
        chat: chatType === "private"
            ? { id: chatId, type: "private" as const, first_name: "U" }
            : { id: chatId, type: "group" as const, title: "Group" },
    };
}

function textUpdate(userId: number, chatId: number, text: string, chatType: "private" | "group" = "private"): Update {
    return {
        update_id: updateSeq,
        message: { ...baseMessage(userId, chatId, chatType), text },
    };
}

function commandUpdate(userId: number, chatId: number, command: string, chatType: "private" | "group"): Update {
    const message = { ...baseMessage(userId, chatId, chatType), text: command };
    return {
        update_id: updateSeq,
        message: {
            ...message,
            entities: [{ type: "bot_command", offset: 0, length: command.length }],
        },
    };
}

function callbackUpdate(userId: number, chatId: number, data: string): Update {
    const message = { ...baseMessage(userId, chatId, "private"), text: "host" };
    return {
        update_id: updateSeq,
        callback_query: {
            id: String(updateSeq),
            from: { id: userId, is_bot: false, first_name: "U" },
            chat_instance: "ci",
            data,
            message,
        },
    };
}

function voiceUpdate(userId: number, chatId: number, duration: number, fileSize?: number): Update {
    const message = baseMessage(userId, chatId, "private");
    return {
        update_id: updateSeq,
        message: {
            ...message,
            voice: { file_id: "voice-file", file_unique_id: "voice-unique", duration, file_size: fileSize },
        },
    };
}

async function createUser(id: number) {
    await prisma.user.create({ data: { id: BigInt(id), timezone: "Europe/Moscow", firstName: `U${id}` } });
}

describe("reminder bot access control", { concurrency: 1 }, () => {
    before(async () => {
        fs.rmSync(dbFile, { force: true });
        const root = path.resolve(__dirname, "..");
        const sqlite = new Database(dbFile);
        sqlite.exec(fs.readFileSync(path.join(root, "prisma/migrations/20260117132119_init/migration.sql"), "utf8"));
        sqlite.exec(fs.readFileSync(path.join(root, "prisma/migrations/20261117120000_add_reminder_chat_id/migration.sql"), "utf8"));
        sqlite.close();

        const prismaMod = await import("../src/core/prisma");
        const botMod = await import("../src/bot");
        const schedulerMod = await import("../src/services/scheduler");
        prisma = prismaMod.prisma;
        bot = botMod.bot;
        processDueReminders = schedulerMod.processDueReminders;
        bot.botInfo = {
            id: 1,
            is_bot: true,
            first_name: "Reminder",
            username: "reminder_bot",
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
        };

        // Conversations build a fresh API client, so they bypass bot.api transformers
        // and call node-fetch directly. Stub that too.
        nodeFetch.default = async (input: unknown, init?: { body?: unknown }) => {
            const url = String(input);
            const method = url.split("/").pop()?.split("?")[0] ?? "unknown";
            const payload = typeof init?.body === "string" ? JSON.parse(init.body) : {};
            calls.push({ method, payload });
            if (method === "sendMessage" && sendFailure) {
                return fakeTelegramResponse({ ok: false, error_code: sendFailure.error_code, description: sendFailure.description });
            }
            if (method === "sendMessage" || method === "editMessageText") {
                return fakeTelegramResponse({
                    ok: true,
                    result: { message_id: 1, date: 0, chat: { id: Number(payload.chat_id ?? 1), type: "private" }, text: payload.text },
                });
            }
            return fakeTelegramResponse({ ok: true, result: true });
        };

        bot.api.config.use(async (_prev, method, payload): Promise<any> => {
            const body = (payload ?? {}) as Record<string, any>;
            calls.push({ method, payload: body });
            if (method === "sendMessage" && sendFailure) {
                return { ok: false, error_code: sendFailure.error_code, description: sendFailure.description };
            }
            if (method === "sendMessage" || method === "editMessageText") {
                return {
                    ok: true,
                    result: {
                        message_id: 1,
                        date: 0,
                        chat: { id: Number(body.chat_id ?? 1), type: "private" },
                        text: body.text,
                    },
                };
            }
            return { ok: true, result: method === "getFile" ? { file_id: "voice-file", file_path: "voice/file.oga" } : true };
        });
    });

    after(async () => {
        nodeFetch.default = originalFetch;
        await prisma.$disconnect();
        fs.rmSync(dbFile, { force: true });
    });

    test("callback actions do not cross chats", async () => {
        await createUser(501);
        const reminder = await prisma.reminder.create({
            data: {
                userId: 501n,
                chatId: 501n,
                message: "secret-from-a",
                triggerAt: new Date(Date.now() + 3_600_000),
            },
        });

        resetApi();
        await bot.handleUpdate(callbackUpdate(502, 502, `delete_${reminder.id}`));
        assert.equal(await prisma.reminder.count({ where: { id: reminder.id } }), 1);
        assert.equal(texts("editMessageText").some((text) => text.includes("secret-from-a")), false);

        resetApi();
        await bot.handleUpdate(callbackUpdate(503, 503, `snooze_${reminder.id}_15`));
        const afterSnooze = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
        assert.equal(afterSnooze.triggerAt.getTime(), reminder.triggerAt.getTime());
        assert.equal(texts("editMessageText").some((text) => text.includes("secret-from-a")), false);

        resetApi();
        await bot.handleUpdate(callbackUpdate(504, 504, `done_${reminder.id}`));
        const afterDone = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
        assert.equal(afterDone.completed, false);
        assert.equal(texts("editMessageText").join("\n").includes("secret-from-a"), false);
        assert.equal(texts("sendMessage").join("\n").includes("secret-from-a"), false);

        resetApi();
        await bot.handleUpdate(callbackUpdate(505, 505, `edit_${reminder.id}`));
        const afterEdit = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
        assert.equal(afterEdit.message, "secret-from-a");
        const shown = [...texts("sendMessage"), ...texts("editMessageText")].join("\n");
        assert.equal(shown.includes("secret-from-a"), false);

        resetApi();
        await bot.handleUpdate(callbackUpdate(501, 501, `delete_${reminder.id}`));
        assert.equal(await prisma.reminder.count({ where: { id: reminder.id } }), 0);
    });

    test("the same chat can snooze and complete its own reminder", async () => {
        await createUser(510);
        const reminder = await prisma.reminder.create({
            data: {
                userId: 510n,
                chatId: 510n,
                message: "own-reminder",
                triggerAt: new Date(Date.now() + 3_600_000),
            },
        });

        resetApi();
        await bot.handleUpdate(callbackUpdate(510, 510, `snooze_${reminder.id}_15`));
        const snoozed = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
        const snoozeDelta = snoozed.triggerAt.getTime() - Date.now();
        assert.ok(snoozeDelta > 14 * 60_000 && snoozeDelta < 16 * 60_000);
        assert.match(texts("editMessageText").join("\n"), /own-reminder/);

        resetApi();
        await bot.handleUpdate(callbackUpdate(510, 510, `done_${reminder.id}`));
        const done = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
        assert.equal(done.completed, true);
        assert.match(texts("editMessageText").join("\n"), /own-reminder/);
    });

    test("another group member cannot answer an open conversation", async () => {
        resetApi();
        await bot.handleUpdate(commandUpdate(710, -1000, "/settings", "group"));
        await bot.handleUpdate(textUpdate(711, -1000, "Europe/London", "group"));

        const hijacked = await prisma.user.findUnique({ where: { id: 710n } });
        assert.notEqual(hijacked?.timezone, "Europe/London");
        const intruder = await prisma.user.findUnique({ where: { id: 711n } });
        assert.equal(intruder, null);
    });

    test("rate limit runs before handlers and long voice notes are refused", async () => {
        await createUser(720);
        resetApi();
        for (let i = 0; i < UPDATE_RATE_LIMIT + 1; i++) {
            await bot.handleUpdate(textUpdate(720, 720, "это не дата"));
        }
        const replies = texts("sendMessage");
        assert.equal(replies.length, UPDATE_RATE_LIMIT + 1);
        assert.equal(replies.at(-1), RATE_LIMIT_MESSAGE);
        assert.equal(replies.slice(0, UPDATE_RATE_LIMIT).every((text) => text.includes("не смог распознать")), true);

        resetApi();
        await bot.handleUpdate(voiceUpdate(721, 721, 120, 1000));
        assert.equal(calls.some((call) => call.method === "getFile"), false);
        assert.match(texts("sendMessage").join("\n"), /60/);

        resetApi();
        await bot.handleUpdate(voiceUpdate(722, 722, 15, 11 * 1024 * 1024));
        assert.equal(calls.some((call) => call.method === "getFile"), false);
        assert.match(texts("sendMessage").join("\n"), /большой/);
    });

    test("a user cannot create more than the active reminder cap", async () => {
        const { MAX_ACTIVE_REMINDERS_PER_USER } = await import("../src/services/reminderAccess");
        await createUser(730);
        await prisma.reminder.createMany({
            data: Array.from({ length: MAX_ACTIVE_REMINDERS_PER_USER }, () => ({
                userId: 730n,
                chatId: 730n,
                message: "filled",
                triggerAt: new Date(Date.now() + 3_600_000),
            })),
        });

        resetApi();
        await bot.handleUpdate(textUpdate(730, 730, "через 20 минут вода"));
        assert.equal(await prisma.reminder.count({ where: { userId: 730n } }), MAX_ACTIVE_REMINDERS_PER_USER);
        assert.match(texts("sendMessage").join("\n"), /лимит/);
    });

    test("undeliverable reminders are not retried and a poison recurrence does not spin", async () => {
        await createUser(740);
        const blocked = await prisma.reminder.create({
            data: {
                userId: 740n,
                chatId: 740n,
                message: "blocked-user-secret",
                triggerAt: new Date(Date.now() - 60_000),
            },
        });

        resetApi();
        sendFailure = { error_code: 403, description: "Forbidden: bot was blocked by the user" };
        await processDueReminders(bot);
        await processDueReminders(bot);
        assert.equal(calls.filter((call) => call.method === "sendMessage").length, 1);
        assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: blocked.id } })).completed, true);

        const missing = await prisma.reminder.create({
            data: {
                userId: 740n,
                chatId: 741n,
                message: "gone-chat",
                triggerAt: new Date(Date.now() - 60_000),
            },
        });
        resetApi();
        sendFailure = { error_code: 400, description: "Bad Request: chat not found" };
        await processDueReminders(bot);
        await processDueReminders(bot);
        assert.equal(calls.filter((call) => call.method === "sendMessage").length, 1);
        assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: missing.id } })).completed, true);

        const limited = await prisma.reminder.create({
            data: {
                userId: 740n,
                chatId: 742n,
                message: "retry-me",
                triggerAt: new Date(Date.now() - 60_000),
            },
        });
        resetApi();
        sendFailure = { error_code: 429, description: "Too Many Requests: retry after 1" };
        await processDueReminders(bot);
        await processDueReminders(bot);
        assert.equal(calls.filter((call) => call.method === "sendMessage").length, 2);
        assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: limited.id } })).completed, false);

        await prisma.reminder.updateMany({ where: { completed: false }, data: { completed: true } });
        const poison = await prisma.reminder.create({
            data: {
                userId: 740n,
                chatId: 740n,
                message: "poison-rule",
                triggerAt: new Date(Date.now() - 60_000),
                isRecurring: true,
                recurrenceRule: "RRULE:FREQ=DAILY;INTERVAL=0",
            },
        });
        resetApi();
        const started = Date.now();
        await processDueReminders(bot);
        assert.ok(Date.now() - started < 1000);
        await processDueReminders(bot);
        assert.equal(calls.filter((call) => call.method === "sendMessage").length, 1);
        assert.equal((await prisma.reminder.findUniqueOrThrow({ where: { id: poison.id } })).completed, true);

        await prisma.reminder.updateMany({ where: { completed: false, id: { not: poison.id } }, data: { completed: true } });
        const daily = await prisma.reminder.create({
            data: {
                userId: 740n,
                chatId: 740n,
                message: "daily-ok",
                triggerAt: new Date(Date.now() - 86_400_000),
                isRecurring: true,
                recurrenceRule: "daily",
            },
        });
        resetApi();
        await processDueReminders(bot);
        const advanced = await prisma.reminder.findUniqueOrThrow({ where: { id: daily.id } });
        assert.equal(advanced.completed, false);
        assert.ok(advanced.triggerAt.getTime() > Date.now());
    });
});
