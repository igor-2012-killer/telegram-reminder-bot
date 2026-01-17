import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';

interface ParseResult {
    date: Date;
    hasTimezone: boolean;
    timezoneUsed: string;
    cleanText: string;
    isRecurring: boolean;
    recurrenceRule?: string;
}

export class DateParser {
    /**
     * Parses a date string attempting to handle user's timezone.
     * @param text The input text containing the date
     * @param userTimezone The user's IANA timezone (e.g., 'Europe/Moscow')
     * @param referenceDate The reference date (usually now)
     */
    static parse(text: string, userTimezone: string, referenceDate: Date = new Date()): ParseResult | null {
        // First, check if chrono finds a date
        // passing { timezone: ... } to chrono options might help, but chrono is a bit tricky with explicit vs implied timezones across locales.
        // We will try to parse it.

        // We use the strict parser or casual depending on need. Casual is better for "tomorrow".
        // Chrono's handling of timezones in the text (e.g. "GMT") is automatic.
        // If no timezone is found in text, it returns a date that is effectively "local" to the system or implied.

        // Try Russian first, then fallback to English
        let parsedResults = chrono.ru.casual.parse(text, referenceDate, { forwardDate: true });

        if (parsedResults.length === 0) {
            parsedResults = chrono.parse(text, referenceDate, { forwardDate: true });
        }

        if (parsedResults.length === 0) {
            return null;
        }

        const result = parsedResults[0];
        const components = result.start;

        // check if known values contain a CERTAIN timezone offset
        // Chrono might imply UTC if not specified, which we want to ignore in favor of user's zone.
        const hasCertainOffset = components.isCertain('timezoneOffset');
        const timezoneOffset = components.get('timezoneOffset');

        let finalDate: DateTime;
        let timezoneUsed = userTimezone;
        let hasTimezone = false;

        if (hasCertainOffset && timezoneOffset !== null) {
            // User specified a timezone (e.g. "15:00 GMT")
            finalDate = DateTime.fromJSDate(result.date());
            hasTimezone = true;
            timezoneUsed = `Offset ${timezoneOffset}`;
        } else {
            // Reconstruct in user timezone
            // IMPORTANT: use the reference date in the user's timezone for defaults
            const userNow = DateTime.fromJSDate(referenceDate).setZone(userTimezone);

            const year = components.get('year') ?? userNow.year;
            const month = components.get('month') ?? userNow.month;
            const day = components.get('day') ?? userNow.day;
            let hour = components.get('hour');
            let minute = components.get('minute') ?? 0;
            let second = components.get('second') ?? 0;

            if (hour === null) {
                hour = 12; // Default
            }

            finalDate = DateTime.fromObject({
                year,
                month,
                day,
                hour,
                minute,
                second
            }, { zone: userTimezone });

            // If the time is already passed today, and we didn't specify a day (it was implied from 'userNow'), 
            // Chrono's forwardDate logic usually handles this if we use result.date().
            // But since we manually reconstructed, let's check if we need to bump to tomorrow.
            if (!components.isCertain('day') && finalDate < userNow) {
                finalDate = finalDate.plus({ days: 1 });
            }
        }

        // Clean text: remove the date part and recurring keywords
        let cleanText = text;

        // 1. Remove the exact text matched by chrono
        const index = result.index;
        const dateText = result.text;
        cleanText = (text.slice(0, index) + text.slice(index + dateText.length));

        // 2. Detect and remove recurring keywords independently if needed
        let isRecurring = false;
        let recurrenceRule: string | undefined = undefined;

        const recurringPatterns = [
            { pattern: /every day/i, rule: 'daily' },
            { pattern: /каждый день/i, rule: 'daily' },
            { pattern: /ежедневно/i, rule: 'daily' },
            { pattern: /every week/i, rule: 'weekly' },
            { pattern: /каждую неделю/i, rule: 'weekly' },
            { pattern: /еженедельно/i, rule: 'weekly' },
            { pattern: /каждый/i, rule: 'daily' }, // Broad "every" often implies daily if time is given
        ];

        for (const p of recurringPatterns) {
            if (p.pattern.test(cleanText)) {
                isRecurring = true;
                recurrenceRule = p.rule;
                cleanText = cleanText.replace(p.pattern, '');
            }
        }

        // Final cleanup
        cleanText = cleanText.trim().replace(/\s+/g, ' ');
        if (!cleanText || cleanText.toLowerCase() === 'напомни' || cleanText.toLowerCase() === 'remind') {
            cleanText = "Напоминание";
        }

        return {
            date: finalDate.toJSDate(),
            hasTimezone,
            timezoneUsed,
            cleanText,
            isRecurring,
            recurrenceRule
        };
    }
}
