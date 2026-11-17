import { Middleware } from "grammy";
import { MyContext } from "../types";
import { prisma } from "../../core/prisma";

export const authMiddleware: Middleware<MyContext> = async (ctx, next) => {
    if (ctx.from && ctx.chat?.type === "private") {
        // We generally rely on interactions to create users,
        // but it's good to ensure we know the user if they are sending messages.
        // For the purpose of the bot, we might not strictly need to query DB on every request
        // unless we need the timezone.
        // Let's pass for now and rely on specific handlers to check.
        // Or we can cache the user session.

        // Optimization: In a real bot, use session or memory cache.
        // Here: Check if timezone is set for text messages.
    }
    await next();
};

export async function checkUserSetup(ctx: MyContext): Promise<boolean> {
    if (!ctx.from) return false;
    const user = await prisma.user.findUnique({ where: { id: BigInt(ctx.from.id) } });
    if (!user || !user.timezone) {
        // Trigger setup if not in conversation
        // Note: You can't trigger conversation from here easily without duplication.
        // Just return false.
        return false;
    }
    return true;
}
