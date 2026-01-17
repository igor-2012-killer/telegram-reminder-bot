import { Bot, session } from 'grammy';
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from '../core/config';
import { MyContext, SessionData } from './types';
import { askTimezone } from './conversations/timezone';
import { prisma } from '../core/prisma';
import { DateParser } from '../services/dateParser';
import { DateTime } from 'luxon';

export const bot = new Bot<MyContext>(config.BOT_TOKEN);

// Middleware
bot.use(session({ initial: (): SessionData => ({ isAwaitingTimezone: false }) }));
bot.use(conversations());
bot.use(createConversation(askTimezone));

// Commands
bot.command('start', async (ctx) => {
    await ctx.conversation.enter('askTimezone');
});

bot.command('help', async (ctx) => {
    await ctx.reply("Я бот-напоминалка. Просто напиши мне о чем и когда напомнить.\nНапример:\n- Напомни сходить в магазин завтра в 6 вечера\n- 2026-01-21 15:00 Позвонить маме\n- через 20 минут выключить духовку");
});

// Text Handler
bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id;
    const user = await prisma.user.findUnique({ where: { id: BigInt(userId) } });

    if (!user || !user.timezone) {
        await ctx.reply("Сначала нужно настроить часовой пояс. Запускаю настройку...");
        await ctx.conversation.enter('askTimezone');
        return;
    }

    const text = ctx.message.text;
    const now = new Date();

    const result = DateParser.parse(text, user.timezone, now);

    if (result) {
        await prisma.reminder.create({
            data: {
                userId: BigInt(userId),
                message: result.cleanText,
                triggerAt: result.date,
                originalInput: text
            }
        });

        const formatted = DateTime.fromJSDate(result.date).setZone(user.timezone).toFormat('dd MMM yyyy HH:mm ZZZZ');
        await ctx.reply(`Принято! Я напомню: "${result.cleanText}"\n🗓 Время: ${formatted}`);
    } else {
        await ctx.reply("Я не смог распознать дату в этом сообщении. Попробуй указать время точнее.");
    }
});
