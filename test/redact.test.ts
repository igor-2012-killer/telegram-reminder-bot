import { test } from "node:test";
import assert from "node:assert/strict";
import { errorForLog, redactSecrets } from "../src/core/redact";

process.env.BOT_TOKEN = "123456:SUPER_SECRET_TOKEN";
process.env.GROQ_API_KEY = "gsk_test_secret_key";

test("redacts the bot token and the Groq key", () => {
    const url = "https://api.telegram.org/file/bot123456:SUPER_SECRET_TOKEN/voice/file.oga";
    assert.equal(
        redactSecrets(`${url} key=gsk_test_secret_key`),
        "https://api.telegram.org/file/bot[REDACTED]/voice/file.oga key=[REDACTED]",
    );
});

test("logs only the error message, not an axios-style request object", () => {
    const error = new Error("Request failed with status code 404 for bot123456:SUPER_SECRET_TOKEN");
    (error as Error & { config?: unknown }).config = {
        url: "https://api.telegram.org/file/bot123456:SUPER_SECRET_TOKEN/voice/file.oga",
    };
    const logged = errorForLog(error);
    assert.equal(logged.includes("SUPER_SECRET_TOKEN"), false);
    assert.equal(logged.includes("file.oga"), false);
    assert.match(logged, /Request failed/);
});
