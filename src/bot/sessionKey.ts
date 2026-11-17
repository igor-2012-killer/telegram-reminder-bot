import { Context } from "grammy";

/**
 * Sessions and conversation state default to the chat id, so in a group one
 * member's reply continues another member's open dialog. Include the user id.
 * Updates without a sender (channel posts) stay keyed by the chat.
 */
export function getSessionKey(ctx: Context): string | undefined {
    const chatId = ctx.chat?.id;
    if (chatId == null) return undefined;
    const userId = ctx.from?.id;
    if (userId == null) return String(chatId);
    return `${chatId}:${userId}`;
}
