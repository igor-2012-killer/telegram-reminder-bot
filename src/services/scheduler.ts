import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../bot/types";
import { prisma } from "../core/prisma";
import { errorForLog } from "../core/redact";
import logger from "../core/logger";
import { isPermanentDeliveryError } from "./deliveryError";
import { nextOccurrence } from "./recurrence";

const TICK_MS = 10_000;
const BATCH_SIZE = 50;

let ticking = false;

async function markCompleted(id: number) {
    await prisma.reminder.update({
        where: { id },
        data: { completed: true }
    });
}

export async function processDueReminders(bot: Bot<MyContext>, now = new Date()) {
    const pendingReminders = await prisma.reminder.findMany({
        where: {
            completed: false,
            triggerAt: {
                lte: now
            }
        },
        include: { creator: true },
        orderBy: { triggerAt: "asc" },
        take: BATCH_SIZE
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
                const next = nextOccurrence(
                    reminder.recurrenceRule,
                    reminder.triggerAt,
                    now,
                    reminder.creator.timezone
                );
                if (!next) {
                    await markCompleted(reminder.id);
                    continue;
                }
                await prisma.reminder.update({
                    where: { id: reminder.id },
                    data: { triggerAt: next }
                });
            } else {
                await markCompleted(reminder.id);
            }
        } catch (e) {
            if (isPermanentDeliveryError(e)) {
                try {
                    await markCompleted(reminder.id);
                } catch (updateError) {
                    logger.error({ reminderId: reminder.id, error: errorForLog(updateError) }, "Failed to retire undeliverable reminder");
                }
                logger.warn({ reminderId: reminder.id, error: errorForLog(e) }, "Stopped retrying undeliverable reminder");
            } else {
                logger.error({ reminderId: reminder.id, error: errorForLog(e) }, "Failed to send reminder");
            }
        }
    }
}

export function runScheduler(bot: Bot<MyContext>) {
    const timer = setInterval(() => {
        if (ticking) return;
        ticking = true;
        processDueReminders(bot)
            .catch((error) => {
                logger.error({ error: errorForLog(error) }, "Scheduler tick failed");
            })
            .finally(() => {
                ticking = false;
            });
    }, TICK_MS);
    timer.unref?.();
}
