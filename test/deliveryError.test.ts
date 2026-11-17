import { test } from "node:test";
import assert from "node:assert/strict";
import { GrammyError } from "grammy";
import { isPermanentDeliveryError } from "../src/services/deliveryError";

function grammyError(errorCode: number, description: string) {
    return new GrammyError(
        "send failed",
        {
            ok: false,
            error_code: errorCode,
            description,
        },
        "sendMessage",
        { chat_id: 1, text: "secret reminder text" },
    );
}

test("403 and chat-not-found are permanent", () => {
    assert.equal(
        isPermanentDeliveryError(grammyError(403, "Forbidden: bot was blocked by the user")),
        true,
    );
    assert.equal(
        isPermanentDeliveryError(grammyError(403, "Forbidden: bot was kicked from the group chat")),
        true,
    );
    assert.equal(isPermanentDeliveryError(grammyError(400, "Bad Request: chat not found")), true);
    assert.equal(
        isPermanentDeliveryError(grammyError(400, "Bad Request: user is deactivated")),
        true,
    );
});

test("rate limits and network failures are retried", () => {
    assert.equal(
        isPermanentDeliveryError(grammyError(429, "Too Many Requests: retry after 1")),
        false,
    );
    assert.equal(isPermanentDeliveryError(grammyError(500, "Internal Server Error")), false);
    assert.equal(isPermanentDeliveryError(new Error("socket hang up")), false);
});
