import { Bot, session, InlineKeyboard } from 'grammy';
import { conversations, createConversation } from "@grammyjs/conversations";
import { limit } from "@grammyjs/ratelimiter";
import { config } from '../core/config';
import { errorForLog } from '../core/redact';
import logger from '../core/logger';
import { MyContext, SessionData } from './types';
import { askTimezone } from './conversations/timezone';
import { editReminder } from './conversations/editReminder';
import { getSessionKey } from './sessionKey';
import {
    RATE_LIMIT_MESSAGE,
    UPDATE_RATE_LIMIT,
    UPDATE_RATE_WINDOW_MS,
    mediaRejectionReason,
} from './limits';
import { prisma } from '../core/prisma';
import {
    MAX_ACTIVE_REMINDERS_PER_USER,
    countActiveReminders,
    deleteReminderInChat,
    findReminderInChat,
    updateReminderInChat,
} from '../services/reminderAccess';
import { DateParser, InvalidRecurrenceIntervalError } from '../services/dateParser';
import { STTService } from '../services/sttService';
import { DateTime } from 'luxon';

export const bot = new Bot<MyContext>(config.BOT_TOKEN);

const BOT_COMMANDS = [
    { command: "list", description: "Список моих напоминаний" },
    { command: "settings", description: "Настройка часового пояса" },
    { command: "help", description: "Справка по использованию" },
    { command: "cancel", description: "Отменить текущее действие" },
];

export function registerBotCommands() {
    return bot.api.setMyCommands(BOT_COMMANDS);
}

// Middleware. The limiter has to be installed before handlers, otherwise a
// matched handler finishes the update and the limiter never runs.
bot.use(session({
    initial: (): SessionData => ({ isAwaitingTimezone: false }),
    getSessionKey,
}));
bot.use(limit({
    timeFrame: UPDATE_RATE_WINDOW_MS,
    limit: UPDATE_RATE_LIMIT,
    onLimitExceeded: async (ctx) => {
        await ctx.reply(RATE_LIMIT_MESSAGE);
    },
}));
// Conversation state is stored separately from the grammY session and defaults
// to a chat id, which lets one group member continue another's dialog.
const conversationState = new Map<string, any>();
bot.use(conversations({
    storage: {
        type: "key",
        getStorageKey: getSessionKey,
        adapter: {
            read: (key) => conversationState.get(key),
            write: (key, value) => {
                conversationState.set(key, value);
            },
            delete: (key) => {
                conversationState.delete(key);
            },
        },
    },
}));
bot.use(createConversation(askTimezone));
bot.use(createConversation(editReminder));

// Error handling
bot.catch((err) => {
    const ctx = err.ctx;
    logger.error({
        update_id: ctx.update.update_id,
        error: errorForLog(err.error)
    }, `Error while handling update ${ctx.update.update_id}`);
});

// Commands
bot.command('start', async (ctx) => {
    await ctx.conversation.enter('askTimezone');
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        "Я бот-напоминалка. Просто напиши мне о чем и когда напомнить.\n\n" +
        "**Примеры:**\n" +
        "- Напомни сходить в магазин завтра в 6 вечера\n" +
        "- 2026-01-21 15:00 Позвонить маме\n" +
        "- через 20 минут выключить духовку\n" +
        "- каждую субботу в 11:00 уборка\n\n" +
        "**Команды:**\n" +
        "/list - список напоминаний\n" +
        "/settings - изменить часовой пояс\n" +
        "/help - эта справка"
        , { parse_mode: "Markdown" });
});

bot.command('settings', async (ctx) => {
    await ctx.conversation.enter('askTimezone');
});

bot.command('cancel', async (ctx) => {
    await ctx.reply("Нет активных действий для отмены.");
});

bot.command('list', async (ctx) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId || !userId) return;

    const reminders = await prisma.reminder.findMany({
        where: { chatId: BigInt(chatId), completed: false },
        orderBy: { triggerAt: 'asc' }
    });

    const user = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
    const tz = user?.timezone || 'UTC';

    if (reminders.length === 0) {
        await ctx.reply("У вас нет активных напоминаний.");
        return;
    }

    await ctx.reply("Ваши напоминания:");

    for (const r of reminders) {
        const date = DateTime.fromJSDate(r.triggerAt).setZone(tz);
        let text = `📅 ${date.toFormat('dd.MM.yyyy HH:mm')}\n📝 ${r.message}`;
        if (r.isRecurring) {
            text += `\n🔄 Повтор: ${r.recurrenceRule}`;
        }

        const keyboard = new InlineKeyboard()
            .text("❌ Удалить", `delete_${r.id}`)
            .text("📝 Изменить", `edit_${r.id}`);
        await ctx.reply(text, { reply_markup: keyboard });
    }
});

function callbackChatId(ctx: { chat?: { id: number } | undefined }): bigint | null {
    if (ctx.chat?.id == null) return null;
    return BigInt(ctx.chat.id);
}

async function rejectCallback(ctx: { answerCallbackQuery: (text?: string) => Promise<unknown>; editMessageText?: (text: string) => Promise<unknown> }, text: string, edit?: string) {
    await ctx.answerCallbackQuery(text);
    if (edit) await ctx.editMessageText!(edit);
}

// Handle deletion via callback
bot.callbackQuery(/^delete_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const chatId = callbackChatId(ctx);
    if (!chatId) {
        await rejectCallback(ctx, "Ошибка удаления", "⚠️ Напоминание не найдено или уже удалено");
        return;
    }

    try {
        const deleted = await deleteReminderInChat(id, chatId);
        if (deleted.count === 0) {
            await rejectCallback(ctx, "Ошибка удаления", "⚠️ Напоминание не найдено или уже удалено");
            return;
        }

        logger.info({ reminderId: id }, "Reminder deleted via callback");
        await ctx.answerCallbackQuery("Напоминание удалено");
        await ctx.editMessageText(`✅ Напоминание удалено`);
    } catch (e) {
        logger.error({ reminderId: id, error: errorForLog(e) }, "Reminder delete failed");
        await rejectCallback(ctx, "Ошибка удаления", "⚠️ Напоминание не найдено или уже удалено");
    }
});

bot.callbackQuery(/^snooze_(\d+)_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const minutes = parseInt(ctx.match[2], 10);
    const chatId = callbackChatId(ctx);
    if (!chatId) {
        await rejectCallback(ctx, "Ошибка", "⚠️ Не удалось отложить напоминание");
        return;
    }

    try {
        const reminder = await findReminderInChat(id, chatId);
        if (!reminder) {
            await rejectCallback(ctx, "Ошибка", "⚠️ Не удалось отложить напоминание");
            return;
        }

        const newTime = DateTime.now().plus({ minutes }).toJSDate();
        const updated = await updateReminderInChat(id, chatId, { triggerAt: newTime, completed: false });
        if (updated.count === 0) {
            await rejectCallback(ctx, "Ошибка", "⚠️ Не удалось отложить напоминание");
            return;
        }

        logger.info({ reminderId: id, minutes }, "Reminder snoozed");
        await ctx.answerCallbackQuery(`Отложено на ${minutes} мин.`);
        await ctx.editMessageText(`💤 Напоминание отложено на ${minutes} минут.\n\n${reminder.message}`);
    } catch (e) {
        logger.error({ reminderId: id, error: errorForLog(e) }, "Reminder snooze failed");
        await rejectCallback(ctx, "Ошибка", "⚠️ Не удалось отложить напоминание");
    }
});

bot.callbackQuery(/^done_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const chatId = callbackChatId(ctx);
    if (!chatId) {
        await ctx.answerCallbackQuery("Ошибка");
        return;
    }

    try {
        const reminder = await findReminderInChat(id, chatId);
        if (!reminder) {
            await ctx.answerCallbackQuery("Ошибка");
            return;
        }

        const updated = await updateReminderInChat(id, chatId, { completed: true });
        if (updated.count === 0) {
            await ctx.answerCallbackQuery("Ошибка");
            return;
        }

        await ctx.answerCallbackQuery("Готово!");
        await ctx.editMessageText(`✅ Выполнено!\n\n${reminder.message}`);
    } catch (e) {
        logger.error({ reminderId: id, error: errorForLog(e) }, "Reminder done failed");
        await ctx.answerCallbackQuery("Ошибка");
    }
});

bot.callbackQuery(/^edit_(\d+)$/, async (ctx) => {
    await ctx.conversation.enter('editReminder');
});

async function handleReminderInput(ctx: MyContext, text: string) {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    const user = await prisma.user.findUnique({ where: { id: BigInt(userId) } });

    if (!user || !user.timezone) {
        if (ctx.chat.type === 'private') {
            await ctx.reply("Сначала нужно настроить часовой пояс. Запускаю настройку...");
            await ctx.conversation.enter('askTimezone');
        } else {
            await ctx.reply("У вас не настроен часовой пояс. Пожалуйста, напишите мне в личные сообщения для настройки.");
        }
        return;
    }

    const now = new Date();
    let result;
    try {
        result = DateParser.parse(text, user.timezone, now);
    } catch (e) {
        if (e instanceof InvalidRecurrenceIntervalError) {
            await ctx.reply(`Интервал повтора должен быть от 1 до 999.`);
            return;
        }
        throw e;
    }

    if (result) {
        const active = await countActiveReminders(BigInt(userId));
        if (active >= MAX_ACTIVE_REMINDERS_PER_USER) {
            await ctx.reply(`Слишком много активных напоминаний (лимит ${MAX_ACTIVE_REMINDERS_PER_USER}). Удалите или завершите часть из них.`);
            return;
        }

        const created = await prisma.reminder.create({
            data: {
                userId: BigInt(userId),
                chatId: BigInt(chatId),
                message: result.cleanText,
                triggerAt: result.date,
                originalInput: text,
                isRecurring: result.isRecurring,
                recurrenceRule: result.recurrenceRule
            }
        });

        logger.info({ userId, chatId, triggerAt: result.date }, "New reminder created");
        const formatted = DateTime.fromJSDate(result.date).setZone(user.timezone).toFormat('dd MMM yyyy HH:mm ZZZZ');

        const keyboard = new InlineKeyboard().text("❌ Удалить", `delete_${created.id}`);
        await ctx.reply(`Принято! Я напомню: "${result.cleanText}"\n🗓 Время: ${formatted}`, { reply_markup: keyboard });
    } else {
        await ctx.reply("Я не смог распознать дату в этом сообщении. Попробуй указать время точнее.");
    }
}

// Media Handler
bot.on(["message:voice", "message:video_note"], async (ctx) => {
    const media = ctx.message.voice ?? ctx.message.video_note;
    if (!media?.file_id) return;

    const rejection = mediaRejectionReason(media);
    if (rejection) {
        await ctx.reply(rejection);
        return;
    }

    const waitMsg = await ctx.reply("🎙 Расшифровываю ваше сообщение...");

    try {
        const file = await ctx.api.getFile(media.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

        const transcription = await STTService.transcribe(fileUrl);
        await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, `📝 Расшифровка: "${transcription}"\n\nСоздаю напоминание...`);

        await handleReminderInput(ctx, transcription);
    } catch (error) {
        logger.error({ error: errorForLog(error) }, "Error in media handler");
        await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, "⚠️ Не удалось расшифровать аудио. Попробуйте написать текстом.");
    }
});

// Text Handler
bot.on('message:text', async (ctx) => {
    await handleReminderInput(ctx, ctx.message.text);
});
