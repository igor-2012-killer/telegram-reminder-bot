import { Bot, session, InlineKeyboard, Context, SessionFlavor } from 'grammy';
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from '../core/config';
import { MyContext, SessionData } from './types';
import { askTimezone } from './conversations/timezone';
import { editReminder } from './conversations/editReminder';
import { prisma } from '../core/prisma';
import { DateParser } from '../services/dateParser';
import { STTService } from '../services/sttService';
import { DateTime } from 'luxon';
import logger from '../core/logger';

export const bot = new Bot<MyContext>(config.BOT_TOKEN);

// Middleware
bot.use(session({ initial: (): SessionData => ({ isAwaitingTimezone: false }) }));
bot.use(conversations());
bot.use(createConversation<MyContext, Context & SessionFlavor<SessionData>>(askTimezone));
bot.use(createConversation<MyContext, Context & SessionFlavor<SessionData>>(editReminder));

// Error handling
bot.catch((err) => {
    const ctx = err.ctx;
    logger.error({
        update_id: ctx.update.update_id,
        err: err.error
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

// Handle deletion via callback
bot.callbackQuery(/^delete_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);

    try {
        await prisma.reminder.delete({ where: { id } });
        logger.info({ reminderId: id }, "Reminder deleted via callback");
        await ctx.answerCallbackQuery("Напоминание удалено");
        await ctx.editMessageText(`✅ Напоминание удалено`);
    } catch (e) {
        await ctx.answerCallbackQuery("Ошибка удаления");
        await ctx.editMessageText("⚠️ Напоминание не найдено или уже удалено");
    }
});

bot.callbackQuery(/^snooze_(\d+)_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    const minutes = parseInt(ctx.match[2]);

    try {
        const reminder = await prisma.reminder.findUnique({ where: { id } });
        if (!reminder) throw new Error("Not found");

        const newTime = DateTime.now().plus({ minutes }).toJSDate();
        await prisma.reminder.update({
            where: { id },
            data: { triggerAt: newTime, completed: false }
        });

        logger.info({ reminderId: id, minutes }, "Reminder snoozed");
        await ctx.answerCallbackQuery(`Отложено на ${minutes} мин.`);
        await ctx.editMessageText(`💤 Напоминание отложено на ${minutes} минут.\n\n${reminder.message}`);
    } catch (e) {
        await ctx.answerCallbackQuery("Ошибка");
        await ctx.editMessageText("⚠️ Не удалось отложить напоминание");
    }
});

bot.callbackQuery(/^done_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);

    try {
        await prisma.reminder.update({
            where: { id },
            data: { completed: true }
        });
        await ctx.answerCallbackQuery("Готово!");
        await ctx.editMessageText(`✅ Выполнено!\n\n${(await prisma.reminder.findUnique({ where: { id } }))?.message || ""}`);
    } catch (e) {
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
    const result = DateParser.parse(text, user.timezone, now);

    if (result) {
        await prisma.reminder.create({
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

        logger.info({ userId, chatId, message: result.cleanText, triggerAt: result.date }, "New reminder created");
        const formatted = DateTime.fromJSDate(result.date).setZone(user.timezone).toFormat('dd MMM yyyy HH:mm ZZZZ');

        const created = await prisma.reminder.findFirst({
            where: { chatId: BigInt(chatId) },
            orderBy: { id: 'desc' }
        });

        const keyboard = created ? new InlineKeyboard().text("❌ Удалить", `delete_${created.id}`) : undefined;
        await ctx.reply(`Принято! Я напомню: "${result.cleanText}"\n🗓 Время: ${formatted}`, { reply_markup: keyboard });
    } else {
        await ctx.reply("Я не смог распознать дату в этом сообщении. Попробуй указать время точнее.");
    }
}

// Media Handler
bot.on(["message:voice", "message:video_note"], async (ctx) => {
    const fileId = ctx.message.voice?.file_id || ctx.message.video_note?.file_id;
    if (!fileId) return;

    const waitMsg = await ctx.reply("🎙 Расшифровываю ваше сообщение...");

    try {
        const file = await ctx.api.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

        const transcription = await STTService.transcribe(fileUrl);
        await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, `📝 Расшифровка: "${transcription}"\n\nСоздаю напоминание...`);

        await handleReminderInput(ctx, transcription);
    } catch (error) {
        logger.error(error, "Error in media handler");
        await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, "⚠️ Не удалось расшифровать аудио. Попробуйте написать текстом.");
    }
});

// Text Handler
bot.on('message:text', async (ctx) => {
    await handleReminderInput(ctx, ctx.message.text);
});
