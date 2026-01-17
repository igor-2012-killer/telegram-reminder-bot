import { Context, SessionFlavor } from "grammy";
import { type Conversation } from "@grammyjs/conversations";
import { MyContext, SessionData } from "../types";
import { DateTime } from 'luxon';
import { prisma } from "../../core/prisma";

const CITY_ALIASES: Record<string, string> = {
    'moscow': 'Europe/Moscow',
    'msk': 'Europe/Moscow',
    'spb': 'Europe/Moscow',
    'piter': 'Europe/Moscow',
    'saint-petersburg': 'Europe/Moscow',
    'london': 'Europe/London',
    'kyiv': 'Europe/Kyiv',
    'kiev': 'Europe/Kyiv',
    'minsk': 'Europe/Minsk',
    'paris': 'Europe/Paris',
    'berlin': 'Europe/Berlin',
    'rome': 'Europe/Rome',
    'new york': 'America/New_York',
    'ny': 'America/New_York',
    'nyc': 'America/New_York',
    'tokyo': 'Asia/Tokyo',
};

function normalizeTimezone(input: string): string {
    const clean = input.trim().toLowerCase();

    // 1. Check aliases
    if (CITY_ALIASES[clean]) {
        return CITY_ALIASES[clean];
    }

    // 2. Try as is (preserve case for IANA but try)
    if (DateTime.now().setZone(input).isValid) {
        return input;
    }

    // 3. Try to find strict match in supported zones (capitalized)
    // Heuristic: If user typed 'moscow', we tried alias.
    // If user typed 'Europe/moscow', Luxon might fail if it's case sensitive (depends on browser/node ICU).
    // Node usually handles case insensitive, but let's be safe.

    // We can assume valid if Luxon accepts it. 
    // If ignoring direct simple match, let's try prefixing common regions? 
    // 'Europe/' + Capitalized? Too guessing.

    return input;
}

export async function askTimezone(conversation: Conversation<MyContext, Context & SessionFlavor<SessionData>>, ctx: Context & SessionFlavor<SessionData>) {
    await ctx.reply("Привет! Перед началом работы, пожалуйста, укажи свой часовой пояс. \nНапиши город (например, 'Moscow') или регион (например, 'Europe/Moscow').");

    // Loop until valid
    while (true) {
        const { message } = await conversation.wait();

        if (message?.text) {
            const rawInput = message.text;
            const timezone = normalizeTimezone(rawInput);
            const valid = DateTime.now().setZone(timezone).isValid;

            if (valid) {
                const userId = ctx.from?.id;
                if (userId) {
                    await prisma.user.upsert({
                        where: { id: BigInt(userId) },
                        update: { timezone: timezone },
                        create: {
                            id: BigInt(userId),
                            timezone: timezone,
                            username: ctx.from?.username,
                            firstName: ctx.from?.first_name
                        }
                    });
                    await ctx.reply(`Отлично! Твой часовой пояс установлен как: ${timezone}`);
                    return;
                }
            } else {
                await ctx.reply("Извини, я не понял этот часовой пояс. Попробуй 'Europe/Moscow' или 'UTC'.");
            }
        }
    }
}
