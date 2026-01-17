import { Bot } from "grammy";
import { MyContext } from "../bot/types";
import { prisma } from "../core/prisma";
import { DateTime } from 'luxon';

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
            include: { user: true }
        });

        for (const reminder of pendingReminders) {
            try {
                await bot.api.sendMessage(Number(reminder.userId), `🔔 НАПОМИНАНИЕ!\n\n${reminder.message}`);

                if (reminder.isRecurring && reminder.recurrenceRule && reminder.user?.timezone) {
                    const tz = reminder.user.timezone;
                    let nextTrigger = DateTime.fromJSDate(reminder.triggerAt).setZone(tz);
                    const nowZoned = DateTime.fromJSDate(now).setZone(tz);

                    // Add intervals until we are in the future
                    while (nextTrigger <= nowZoned) {
                        if (reminder.recurrenceRule === 'daily') {
                            nextTrigger = nextTrigger.plus({ days: 1 });
                        } else if (reminder.recurrenceRule === 'weekly') {
                            nextTrigger = nextTrigger.plus({ weeks: 1 });
                        } else {
                            break; // Unknown rule or not supported for multi-plus
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
                console.error(`Failed to send reminder ${reminder.id}`, e);
            }
        }

    }, 10000); // Check every 10s
}
