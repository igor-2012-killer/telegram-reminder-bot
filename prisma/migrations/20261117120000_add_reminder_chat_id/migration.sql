-- RedefineTables
-- The init migration predated Reminder.chatId. Rebuild the table so existing
-- databases match schema.prisma. Private chats use the user's id as the chat
-- id, which is the only destination we can recover for rows that never stored one.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reminder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" BIGINT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "message" TEXT NOT NULL,
    "triggerAt" DATETIME NOT NULL,
    "originalInput" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Reminder" ("completed", "createdAt", "id", "isRecurring", "message", "originalInput", "recurrenceRule", "triggerAt", "userId", "chatId")
SELECT "completed", "createdAt", "id", "isRecurring", "message", "originalInput", "recurrenceRule", "triggerAt", "userId", "userId" FROM "Reminder";
DROP TABLE "Reminder";
ALTER TABLE "new_Reminder" RENAME TO "Reminder";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
