import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor } from "@grammyjs/conversations";

export interface SessionData {
    isAwaitingTimezone: boolean;
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
