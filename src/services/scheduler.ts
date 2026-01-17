import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../bot/types";
import { prisma } from "../core/prisma";
import { DateTime } from 'luxon';
import logger from "../core/logger";

export function runScheduler(bot: Bot<MyContext>) {
    setInterval(async () => {
        const now = new Date();
        const pendingReminders = await prisma.reminder.findMany({
            where: {
                completed: false,
                triggerAt: {
                    lte: now
                }
            },
            include: { creator: true }
        });

        for (const reminder of pendingReminders) {
            try {
                const keyboard = new InlineKeyboard()
                    .text("✅ Готово", `done_${reminder.id}`)
                    .row()
                    .text("💤 +15м", `snooze_${reminder.id}_15`)
                    .text("💤 +1ч", `snooze_${reminder.id}_60`);

                await bot.api.sendMessage(
                    Number(reminder.chatId),
                    `⏰ Напоминание!\n\n${reminder.message}`,
                    { reply_markup: keyboard }
                );

                if (reminder.isRecurring && reminder.recurrenceRule && reminder.creator?.timezone) {
                    const tz = reminder.creator.timezone;
                    let nextTrigger: DateTime;

                    if (reminder.recurrenceRule.startsWith('RRULE:')) {
                        const { RRule } = await import('rrule');
                        const rule = RRule.fromString(reminder.recurrenceRule);
                        const nextDate = rule.after(now);
                        if (nextDate) {
                            nextTrigger = DateTime.fromJSDate(nextDate).setZone(tz);
                        } else {
                            // Rule finished or no more occurrences
                            await prisma.reminder.update({
                                where: { id: reminder.id },
                                data: { completed: true }
                            });
                            continue;
                        }
                    } else {
                        nextTrigger = DateTime.fromJSDate(reminder.triggerAt).setZone(tz);
                        const nowZoned = DateTime.fromJSDate(now).setZone(tz);

                        // Add intervals until we are in the future
                        while (nextTrigger <= nowZoned) {
                            if (reminder.recurrenceRule === 'daily') {
                                nextTrigger = nextTrigger.plus({ days: 1 });
                            } else if (reminder.recurrenceRule === 'weekly' || reminder.recurrenceRule === 'every week') {
                                nextTrigger = nextTrigger.plus({ weeks: 1 });
                            } else {
                                break; // Unknown simple rule
                            }
                        }
                    }

                    await prisma.reminder.update({
                        where: { id: reminder.id },
                        data: { triggerAt: nextTrigger.toJSDate() }
                    });
                } else {
                    await prisma.reminder.update({
                        where: { id: reminder.id },
                        data: { completed: true }
                    });
                }
            } catch (e) {
                logger.error(e, `Failed to send reminder ${reminder.id}`);
            }
        }

    }, 10000); // Check every 10s
}
