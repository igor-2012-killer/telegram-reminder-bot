import { Context, SessionFlavor, InlineKeyboard } from "grammy";
import { type Conversation } from "@grammyjs/conversations";
import { MyContext, SessionData } from "../types";
import { DateTime } from "luxon";
import { prisma } from "../../core/prisma";

const CITY_ALIASES: Record<string, string> = {
    moscow: "Europe/Moscow",
    msk: "Europe/Moscow",
    spb: "Europe/Moscow",
    piter: "Europe/Moscow",
    "saint-petersburg": "Europe/Moscow",
    london: "Europe/London",
    kyiv: "Europe/Kyiv",
    kiev: "Europe/Kyiv",
    minsk: "Europe/Minsk",
    paris: "Europe/Paris",
    berlin: "Europe/Berlin",
    rome: "Europe/Rome",
    "new york": "America/New_York",
    ny: "America/New_York",
    nyc: "America/New_York",
    tokyo: "Asia/Tokyo",
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

    return input;
}

export async function askTimezone(
    conversation: Conversation<MyContext, Context & SessionFlavor<SessionData>>,
    ctx: Context & SessionFlavor<SessionData>,
) {
    const keyboard = new InlineKeyboard()
        .text("Москва (MSK)", "tz_Europe/Moscow")
        .text("Лондон (GMT)", "tz_Europe/London")
        .row()
        .text("Нью-Йорк (EST)", "tz_America/New_York")
        .text("Киев (EET)", "tz_Europe/Kyiv")
        .row()
        .text("❌ Отмена", "tz_cancel");

    await ctx.reply(
        "Привет! Перед началом работы, пожалуйста, укажи свой часовой пояс. \n\n" +
            "Выбери город из списка ниже или **напиши название своего города** в чат (например, 'Almaty' или 'Europe/Moscow').",
        { reply_markup: keyboard, parse_mode: "Markdown" },
    );

    // Loop until valid
    while (true) {
        const result = await conversation.wait();
        let timezone: string | null = null;

        if (result.callbackQuery?.data) {
            const data = result.callbackQuery.data;
            if (data === "tz_cancel") {
                await ctx.reply("Действие отменено.");
                return;
            }
            if (data.startsWith("tz_")) {
                timezone = data.replace("tz_", "");
                await result.answerCallbackQuery();
            }
        } else if (result.message?.text) {
            const rawInput = result.message.text;
            if (rawInput === "/cancel") {
                await ctx.reply("Действие отменено.");
                return;
            }
            timezone = normalizeTimezone(rawInput);
        }

        if (timezone) {
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
                            firstName: ctx.from?.first_name,
                        },
                    });
                    await ctx.reply(`Отлично! Твой часовой пояс установлен как: **${timezone}**`, {
                        parse_mode: "Markdown",
                    });
                    await ctx.reply(
                        "Теперь ты можешь ставить напоминания! Просто напиши мне что-то вроде:\n\n" +
                            '• "через 5 минут выпить воды"\n' +
                            '• "завтра в 10:00 позвонить врачу"\n' +
                            '• "каждую субботу в 11:00 уборка"\n\n' +
                            "Также доступны команды:\n" +
                            "/list — список твоих напоминаний\n" +
                            "/settings — настройки\n" +
                            "/help — справка",
                    );
                    return;
                }
            } else {
                await ctx.reply(
                    "Извини, я не понял этот часовой пояс. Попробуй 'Europe/Moscow' или введи другой город на английском.",
                );
            }
        }
    }
}
