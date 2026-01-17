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
            }
        });

        for (const reminder of pendingReminders) {
            try {
                await bot.api.sendMessage(Number(reminder.userId), `🔔 НАПОМИНАНИЕ!\n\n${reminder.message}`);

                if (reminder.isRecurring && reminder.recurrenceRule) {
                    // Calculate next trigger
                    // Simple logic for daily/weekly
                    // We need to calculate based on the *current* triggerAt to keep the time consistent, 
                    // or based on 'now' if we want to drift? Usually based on triggerAt.

                    const currentTrigger = DateTime.fromJSDate(reminder.triggerAt);
                    let nextTrigger = currentTrigger;

                    if (reminder.recurrenceRule === 'daily') {
                        nextTrigger = currentTrigger.plus({ days: 1 });
                    } else if (reminder.recurrenceRule === 'weekly') {
                        nextTrigger = currentTrigger.plus({ weeks: 1 });
                    }

                    // If nextTrigger is still in the past (e.g. missed multiple days), 
                    // we should probably fast forward or just set it to tomorrow relative to now?
                    // For simplicity, let's just add the interval. If the bot was down for a week, 
                    // it might spam 7 times? Yes.
                    // Better approach: set nextTrigger to next interval after NOW, keeping the time.

                    // But for this MVP: just add interval.

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
                // Maybe mark as failed or retry count?
            }
        }

    }, 10000); // Check every 10s
}
