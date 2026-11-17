const SECRET_ENV_VARS = ["BOT_TOKEN", "GROQ_API_KEY"] as const;

/** Strip secrets that sometimes end up inside error messages (for example a Telegram file URL). */
export function redactSecrets(text: string): string {
    let redacted = text;
    for (const name of SECRET_ENV_VARS) {
        const secret = process.env[name];
        if (!secret) continue;
        redacted = redacted.split(secret).join("[REDACTED]");
    }
    return redacted;
}

/**
 * Log-safe description of an error.
 * Only the message is kept: raw Axios/grammY errors can carry request URLs
 * (with BOT_TOKEN) or the reminder text that was being sent.
 */
export function errorForLog(error: unknown): string {
    if (error instanceof Error) return redactSecrets(error.message);
    if (typeof error === "string") return redactSecrets(error);
    return "Unknown error";
}
