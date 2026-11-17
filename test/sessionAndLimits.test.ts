import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "grammy";
import { getSessionKey } from "../src/bot/sessionKey";
import { MAX_MEDIA_DURATION_SEC, MAX_MEDIA_FILE_BYTES, mediaRejectionReason } from "../src/bot/limits";

test("group sessions are per user, private and channel keys stay stable", () => {
    const groupA = { chat: { id: -100 }, from: { id: 5 } } as unknown as Context;
    const groupB = { chat: { id: -100 }, from: { id: 6 } } as unknown as Context;
    assert.notEqual(getSessionKey(groupA), getSessionKey(groupB));
    assert.equal(getSessionKey(groupA), "-100:5");

    const channel = { chat: { id: -100 }, from: undefined } as unknown as Context;
    assert.equal(getSessionKey(channel), "-100");
    assert.equal(getSessionKey({ chat: undefined } as unknown as Context), undefined);
});

test("voice notes are capped at 60 seconds and a size ceiling", () => {
    assert.equal(mediaRejectionReason({ duration: MAX_MEDIA_DURATION_SEC, file_size: 1000 }), null);
    assert.match(mediaRejectionReason({ duration: MAX_MEDIA_DURATION_SEC + 1, file_size: 1000 }) ?? "", /60/);
    assert.notEqual(mediaRejectionReason({ duration: 0, file_size: 1000 }), null);
    assert.match(mediaRejectionReason({ duration: undefined, file_size: 100 }) ?? "", /60/);
    assert.match(mediaRejectionReason({ duration: 10, file_size: MAX_MEDIA_FILE_BYTES + 1 }) ?? "", /большой/);
    assert.equal(mediaRejectionReason({ duration: 10 }), null);
});
