import { Context, SessionFlavor, InlineKeyboard } from "grammy";
import { type Conversation } from "@grammyjs/conversations";
import { MyContext, SessionData } from "../types";
import { DateTime } from 'luxon';
import { prisma } from "../../core/prisma";
import { DateParser } from "../../services/dateParser";
import logger from "../../core/logger";

export async function editReminder(conversation: Conversation<MyContext, Context & SessionFlavor<SessionData>>, ctx: Context & SessionFlavor<SessionData>) {
    const reminderIdStr = ctx.callbackQuery?.data?.replace("edit_", "");
    if (!reminderIdStr) return;

    const reminderId = parseInt(reminderIdStr);
    const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });

    if (!reminder) {
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
        `⏰ **Время:** ${DateTime.fromJSDate(reminder.triggerAt).toFormat('dd.MM.yyyy HH:mm')}\n\n` +
        `Что вы хотите изменить?`,
        { reply_markup: menu, parse_mode: "Markdown" }
    );

    const result = await conversation.wait();

    if (result.callbackQuery?.data === "edit_cancel") {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Редактирование отменено.");
        return;
    }

    const action = result.callbackQuery?.data;
    if (!action) return;

    if (action.startsWith("edit_text_")) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Введите новый текст для напоминания:");
        const textUpdate = await conversation.waitFor("message:text");

        await prisma.reminder.update({
            where: { id: reminderId },
            data: { message: textUpdate.message.text }
        });

        logger.info({ reminderId }, "Reminder text updated");
        await textUpdate.reply("✅ Текст обновлен!");
    }
    else if (action.startsWith("edit_time_")) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Введите новое время (например, 'завтра в 10 утра' или 'через 2 часа'):");

        const timeUpdate = await conversation.waitFor("message:text");
        const user = await prisma.user.findUnique({ where: { id: BigInt(ctx.from!.id) } });

        if (!user?.timezone) return;

        const parseResult = DateParser.parse(timeUpdate.message.text, user.timezone, new Date());

        if (parseResult) {
            await prisma.reminder.update({
                where: { id: reminderId },
                data: {
                    triggerAt: parseResult.date,
                    isRecurring: parseResult.isRecurring,
                    recurrenceRule: parseResult.recurrenceRule
                }
            });

            logger.info({ reminderId, newTime: parseResult.date }, "Reminder time updated");
            const formatted = DateTime.fromJSDate(parseResult.date).setZone(user.timezone).toFormat('dd.MM.yyyy HH:mm');
            await timeUpdate.reply(`✅ Время обновлено на: **${formatted}**`, { parse_mode: "Markdown" });
        } else {
            await timeUpdate.reply("❌ Не удалось распознать дату. Редактирование отменено.");
        }
    }
}
