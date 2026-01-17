import { Bot } from "grammy";
import { MyContext } from "../bot/types";
import { prisma } from "../core/prisma";

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

                await prisma.reminder.update({
                    where: { id: reminder.id },
                    data: { completed: true }
                });
            } catch (e) {
                console.error(`Failed to send reminder ${reminder.id}`, e);
                // Maybe mark as failed or retry count?
            }
        }

    }, 10000); // Check every 10s
}
