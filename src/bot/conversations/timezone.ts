import { Context, SessionFlavor } from "grammy";
import { type Conversation } from "@grammyjs/conversations";
import { MyContext, SessionData } from "../types";
import { DateTime } from 'luxon';
import { prisma } from "../../core/prisma";

export async function askTimezone(conversation: Conversation<MyContext, Context & SessionFlavor<SessionData>>, ctx: Context & SessionFlavor<SessionData>) {
    await ctx.reply("Привет! Перед началом работы, пожалуйста, укажи свой часовой пояс. \nНапиши город (например, 'Moscow') или регион (например, 'Europe/Moscow').");

    // Loop until valid
    while (true) {
        const { message } = await conversation.wait();

        if (message?.text) {
            const input = message.text;
            const valid = DateTime.now().setZone(input).isValid;

            if (valid) {
                const userId = ctx.from?.id;
                if (userId) {
                    await prisma.user.upsert({
                        where: { id: BigInt(userId) },
                        update: { timezone: input },
                        create: {
                            id: BigInt(userId),
                            timezone: input,
                            username: ctx.from?.username,
                            firstName: ctx.from?.first_name
                        }
                    });
                    await ctx.reply(`Отлично! Твой часовой пояс установлен как: ${input}`);
                    return;
                }
            } else {
                await ctx.reply("Извини, я не понял этот часовой пояс. Попробуй 'Europe/Moscow' или 'UTC'.");
            }
        }
    }
}
