import { GrammyError } from "grammy";

/**
 * Delivery failures that will not succeed on a later tick:
 * the user blocked the bot, the account is gone, or the chat no longer exists.
 */
export function isPermanentDeliveryError(error: unknown): boolean {
    if (!(error instanceof GrammyError)) return false;
    if (error.error_code === 403) return true;
    if (error.error_code !== 400) return false;

    const description = error.description.toLowerCase();
    return (
        description.includes("chat not found") ||
        description.includes("user is deactivated") ||
        description.includes("peer_id_invalid") ||
        description.includes("bot was kicked") ||
        description.includes("have no rights to send")
    );
}
