import fs from "fs";
import path from "path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(__dirname, "..");

function read(name: string): string {
    return fs.readFileSync(path.join(root, name), "utf8");
}

/** Whole-line match. Patterns like `*.db` are literals, not regexes. */
function matchesLine(text: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}$`, "m").test(text);
}

test(".dockerignore still blocks secrets and databases", () => {
    const text = read(".dockerignore");
    const required = [".env", ".env.*", "*.db", "*.db-journal", "node_modules", ".git", "dist"];
    const missing = required.filter((pattern) => !matchesLine(text, pattern));
    assert.deepEqual(
        missing,
        [],
        `.dockerignore must exclude secrets and image junk (${missing.join(", ")}).`,
    );
});

test("compose injects secrets, Dockerfile does not bake them and drops root", () => {
    const compose = read("docker-compose.yml");
    assert.match(compose, /^[ \t]*-[ \t]*BOT_TOKEN=\$\{BOT_TOKEN\}[ \t]*$/m);
    assert.match(compose, /^[ \t]*-[ \t]*GROQ_API_KEY=\$\{GROQ_API_KEY\}[ \t]*$/m);
    assert.doesNotMatch(compose, /^\s*(COPY|ADD)\b/m);

    const docker = read("Dockerfile");
    assert.match(docker, /^USER node$/m);
    assert.doesNotMatch(docker, /^USER root$/m);
    assert.doesNotMatch(docker, /^ENV[ \t]+(BOT_TOKEN|GROQ_API_KEY)=/m);
    assert.doesNotMatch(docker, /^\s*(COPY|ADD)\s+[^\n]*\.env/m);
    assert.doesNotMatch(docker, /^\s*(COPY|ADD)\s+[^\n]*\.db\b/m);
});

test(".gitignore ignores env and databases, but not package-lock.json", () => {
    const text = read(".gitignore");
    assert.equal(matchesLine(text, ".env"), true);
    assert.equal(matchesLine(text, "*.db"), true);
    // *.lock does not match package-lock.json, but an explicit exception keeps
    // `npm ci`'s lockfile tracked if a broader lock pattern is added later.
    assert.equal(matchesLine(text, "!package-lock.json"), true);
});
