import { Prisma } from "@prisma/client";
import { prisma } from "../core/prisma";

export const MAX_ACTIVE_REMINDERS_PER_USER = 100;

export function reminderInChat(id: number, chatId: bigint) {
    return { id, chatId };
}

export function findReminderInChat(id: number, chatId: bigint) {
    return prisma.reminder.findFirst({ where: reminderInChat(id, chatId) });
}

export function deleteReminderInChat(id: number, chatId: bigint) {
    return prisma.reminder.deleteMany({ where: reminderInChat(id, chatId) });
}

export function updateReminderInChat(
    id: number,
    chatId: bigint,
    data: Prisma.ReminderUpdateManyMutationInput,
) {
    return prisma.reminder.updateMany({ where: reminderInChat(id, chatId), data });
}

export function countActiveReminders(userId: bigint) {
    return prisma.reminder.count({ where: { userId, completed: false } });
}
