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

        const parsedResults = chrono.parse(text, referenceDate, { forwardDate: true });

        if (parsedResults.length === 0) {
            return null;
        }

        const result = parsedResults[0];
        const components = result.start;

        // Remove the date text from the original string to clean up the message
        // Chrono result has `index` and `text`.
        // We might have multiple dates, but we usually look for the first one for the *trigger*.
        // Or we should loop? For now, take the first one.

        const dateText = result.text;
        // Simple replace (careful: replace only first occurrence)
        // Better: use string slicing with index
        const index = result.index;
        const cleanText = (text.slice(0, index) + text.slice(index + dateText.length)).trim().replace(/\s+/g, ' ');

        // check if known values contain timezone offset
        const timezoneOffset = components.get('timezoneOffset');

        let finalDate: DateTime;
        let timezoneUsed = userTimezone;
        let hasTimezone = false;

        if (timezoneOffset !== null) {
            // User specified a timezone (e.g. "15:00 GMT")
            // chrono returns the correct instant in time (Date object), but we want to know what happened.
            // Actually result.date() gives a JS Date object properly shifted.
            finalDate = DateTime.fromJSDate(result.date());
            hasTimezone = true;
            timezoneUsed = `Offset ${timezoneOffset}`;
        } else {
            // Reconstruct in user timezone
            const year = components.get('year') ?? referenceDate.getFullYear();
            const month = components.get('month') ?? undefined;
            const day = components.get('day') ?? undefined;

            // If time is not certain, we should probably check if implicit.
            // But let's assume if it parsed, we use it.
            // However, if user said "Tomorrow", chrono defaults to noon or now.
            // Let's trust chrono's date extraction but shift the *interpretation* of that local time info to the User's zone.

            // Critical: chrono returns a Date which is a specific instant.
            // If I say "Tomorrow at 5pm" and my machine is UTC, chrono gives me "Tomorrow 17:00 UTC".
            // If the user is +3, they meant "Tomorrow 17:00 +3".
            // So we take 17:00 from chrono results and apply +3.

            // components.get('hour') gives the local hour number found.

            let hour = components.get('hour');
            let minute = components.get('minute') ?? 0;
            let second = components.get('second') ?? 0;

            if (hour === null) {
                // No time specified. Default to 09:00 AM?
                // Or preserve what chrono did? Chrono usually puts 12:00.
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
        }

        // Simple recurring detection
        // We look for patterns like "every day", "каждый день", "every week", "каждую неделю".
        // This is very basic.
        let isRecurring = false;
        let recurrenceRule: string | undefined = undefined;

        const lowerText = text.toLowerCase();
        if (lowerText.includes('every day') || lowerText.includes('каждый день')) {
            isRecurring = true;
            recurrenceRule = 'daily';
        } else if (lowerText.includes('every week') || lowerText.includes('каждую неделю')) {
            isRecurring = true;
            recurrenceRule = 'weekly';
        }

        return {
            date: finalDate.toJSDate(),
            hasTimezone,
            timezoneUsed,
            cleanText: cleanText || "Напоминание",
            isRecurring,
            recurrenceRule
        };
    }
}
