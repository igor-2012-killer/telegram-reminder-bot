import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { parseRecurrenceInterval } from './recurrence';

export class InvalidRecurrenceIntervalError extends Error {
    constructor() {
        super("Recurrence interval must be between 1 and 999");
        this.name = "InvalidRecurrenceIntervalError";
    }
}

const EXPLICIT_INTERVAL = /(?:каждые|every)\s+(\d+)\s+(?:дня|день|дней|days|day|недель|недели|неделю|weeks|week)/i;

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

        // Reject before a rule is stored. Chrono often swallows the number in
        // Russian phrases ("каждые 0 дней в 10:00"), so check the original text.
        const explicitInterval = EXPLICIT_INTERVAL.exec(text);
        if (explicitInterval && parseRecurrenceInterval(explicitInterval[1]) === null) {
            throw new InvalidRecurrenceIntervalError();
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
            {
                pattern: /(?:каждые|every)\s+(\d+)\s+(?:дня|дней|days)/i,
                ruleGenerator: (match: RegExpExecArray) => {
                    const interval = parseRecurrenceInterval(match[1]);
                    if (interval === null) return null;
                    return `RRULE:FREQ=DAILY;INTERVAL=${interval}`;
                }
            },
            {
                pattern: /(?:каждые|every)\s+(\d+)\s+(?:недель|недели|weeks)/i,
                ruleGenerator: (match: RegExpExecArray) => {
                    const interval = parseRecurrenceInterval(match[1]);
                    if (interval === null) return null;
                    return `RRULE:FREQ=WEEKLY;INTERVAL=${interval}`;
                }
            },
            {
                pattern: /(?:каждый|every)\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
                ruleGenerator: (match: RegExpExecArray) => {
                    const daysMap: Record<string, string> = {
                        'понедельник': 'MO', 'monday': 'MO',
                        'вторник': 'TU', 'tuesday': 'TU',
                        'среду': 'WE', 'wednesday': 'WE',
                        'четверг': 'TH', 'thursday': 'TH',
                        'пятницу': 'FR', 'friday': 'FR',
                        'субботу': 'SA', 'saturday': 'SA',
                        'воскресенье': 'SU', 'sunday': 'SU'
                    };
                    const day = daysMap[match[1].toLowerCase()];
                    return `RRULE:FREQ=WEEKLY;BYDAY=${day}`;
                }
            },
            { pattern: /каждую|every/i, rule: 'daily' }, // Broad "every" often implies daily if time is given
        ];

        for (const p of recurringPatterns) {
            const match = p.pattern.exec(cleanText);
            if (match) {
                isRecurring = true;
                if ('ruleGenerator' in p && typeof p.ruleGenerator === 'function') {
                    const generated = p.ruleGenerator(match);
                    if (generated == null) throw new InvalidRecurrenceIntervalError();
                    recurrenceRule = generated;
                } else if ('rule' in p && typeof p.rule === 'string') {
                    recurrenceRule = p.rule;
                }
                cleanText = cleanText.replace(p.pattern, '');
                break; // Only one rule for now
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
