import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Id-scoped Reminder operations. findMany, create, and count are intentionally
 * not listed: list/create in src/bot/index.ts already set chatId, and count is
 * not a row read by id. Keep this list aligned with test/reminderAccessGuard.test.ts.
 */
const REMINDER_BY_ID_METHODS = [
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "update",
    "delete",
    "updateMany",
    "deleteMany",
    "upsert",
];

const REMINDER_ACCESS_MESSAGE =
    "reminder-access: user-facing Reminder reads and writes must go through reminderAccess.ts (reminderInChat). Use the helpers in reminderAccess.ts.";

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
        languageOptions: {
            globals: globals.node,
        },
        rules: {
            "no-console": "error",
            // Conversations storage and integration tests still use `any`.
            // Turn this back on only after those are given real types.
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        files: ["src/**/*.ts"],
        ignores: ["src/services/reminderAccess.ts", "src/services/scheduler.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                ...REMINDER_BY_ID_METHODS.map((method) => ({
                    selector: `CallExpression[callee.property.name='${method}'][callee.object.property.name='reminder'][callee.object.object.name='prisma']`,
                    message: REMINDER_ACCESS_MESSAGE,
                })),
            ],
        },
    },
);
