-- The init migration predated Reminder.chatId. This rebuild is only valid when
-- that column is still absent. If it already exists, abort before any write:
-- copying userId over chatId would move group reminders into private chats.
-- Databases that already have the column should mark this migration applied
-- (`npm run migrate` does that) instead of executing the rebuild.
CREATE TEMP TABLE IF NOT EXISTS "_chatid_mig_guard" ("x" INTEGER);
CREATE TEMP TRIGGER IF NOT EXISTS "_chatid_mig_abort"
BEFORE INSERT ON "_chatid_mig_guard"
WHEN EXISTS (
    SELECT 1 FROM pragma_table_info('Reminder') WHERE "name" = 'chatId'
)
BEGIN
    SELECT RAISE(ABORT, 'Reminder.chatId already exists; refusing to overwrite chat destinations');
END;
INSERT INTO "_chatid_mig_guard" ("x") VALUES (1);

-- RedefineTables
-- Rows created before the column existed have no stored destination. Private
-- chats use the user's id, which is the only value those rows can recover.
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
