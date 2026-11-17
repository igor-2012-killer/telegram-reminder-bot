import { Context, SessionFlavor, InlineKeyboard } from "grammy";
import { type Conversation } from "@grammyjs/conversations";
import { MyContext, SessionData } from "../types";
import { DateTime } from "luxon";
import { prisma } from "../../core/prisma";
import { DateParser, InvalidRecurrenceIntervalError } from "../../services/dateParser";
import { findReminderInChat, updateReminderInChat } from "../../services/reminderAccess";
import logger from "../../core/logger";

export async function editReminder(
    conversation: Conversation<MyContext, Context & SessionFlavor<SessionData>>,
    ctx: Context & SessionFlavor<SessionData>,
) {
    const reminderIdStr = ctx.callbackQuery?.data?.replace("edit_", "");
    if (!reminderIdStr) return;

    const reminderId = parseInt(reminderIdStr, 10);
    const chatId = ctx.chat?.id;
    if (!Number.isInteger(reminderId) || chatId == null) {
        await ctx.reply("⚠️ Напоминание не найдено.");
        return;
    }

    const chatKey = BigInt(chatId);
    const reminder = await findReminderInChat(reminderId, chatKey);

    if (!reminder) {
        await ctx.answerCallbackQuery("Напоминание не найдено");
        await ctx.reply("⚠️ Напоминание не найдено.");
        return;
    }

    const menu = new InlineKeyboard()
        .text("📝 Текст", `edit_text_${reminderId}`)
        .text("⏰ Время", `edit_time_${reminderId}`)
        .row()
        .text("❌ Отмена", "edit_cancel");

    await ctx.editMessageText(
        `Редактирование напоминания:\n\n` +
            `📝 **Текст:** ${reminder.message}\n` +
            `⏰ **Время:** ${DateTime.fromJSDate(reminder.triggerAt).toFormat("dd.MM.yyyy HH:mm")}\n\n` +
            `Что вы хотите изменить?`,
        { reply_markup: menu, parse_mode: "Markdown" },
    );

    const result = await conversation.wait();

    if (result.callbackQuery?.data === "edit_cancel") {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Редактирование отменено.");
        return;
    }

    const action = result.callbackQuery?.data;
    if (!action) return;

    if (action === `edit_text_${reminderId}`) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Введите новый текст для напоминания:");
        const textUpdate = await conversation.waitFor("message:text");

        const updated = await updateReminderInChat(reminderId, chatKey, {
            message: textUpdate.message.text,
        });
        if (updated.count === 0) {
            await textUpdate.reply("⚠️ Напоминание не найдено.");
            return;
        }

        logger.info({ reminderId }, "Reminder text updated");
        await textUpdate.reply("✅ Текст обновлен!");
    } else if (action === `edit_time_${reminderId}`) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
            "Введите новое время (например, 'завтра в 10 утра' или 'через 2 часа'):",
        );

        const timeUpdate = await conversation.waitFor("message:text");
        const user = await prisma.user.findUnique({ where: { id: BigInt(ctx.from!.id) } });

        if (!user?.timezone) return;

        let parseResult;
        try {
            parseResult = DateParser.parse(timeUpdate.message.text, user.timezone, new Date());
        } catch (e) {
            if (e instanceof InvalidRecurrenceIntervalError) {
                await timeUpdate.reply(
                    "Интервал повтора должен быть от 1 до 999. Редактирование отменено.",
                );
                return;
            }
            throw e;
        }

        if (parseResult) {
            const updated = await updateReminderInChat(reminderId, chatKey, {
                triggerAt: parseResult.date,
                isRecurring: parseResult.isRecurring,
                recurrenceRule: parseResult.recurrenceRule,
            });
            if (updated.count === 0) {
                await timeUpdate.reply("⚠️ Напоминание не найдено.");
                return;
            }

            logger.info({ reminderId, newTime: parseResult.date }, "Reminder time updated");
            const formatted = DateTime.fromJSDate(parseResult.date)
                .setZone(user.timezone)
                .toFormat("dd.MM.yyyy HH:mm");
            await timeUpdate.reply(`✅ Время обновлено на: **${formatted}**`, {
                parse_mode: "Markdown",
            });
        } else {
            await timeUpdate.reply("❌ Не удалось распознать дату. Редактирование отменено.");
        }
    }
}
