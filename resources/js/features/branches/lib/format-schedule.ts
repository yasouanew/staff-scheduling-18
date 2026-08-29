/**
 * Presentation helpers for a branch's trading hours and break policy.
 *
 * The API returns machine-friendly values (`"09:00"`, `90`, `true`). These
 * helpers turn them into the phrasing a manager would actually use — "9:00 AM",
 * "1 hr 30 min unpaid" — and live outside the components so the list, the detail
 * page and any future export all describe a schedule identically.
 */

import { format, parse } from 'date-fns';

import { WEEKDAYS, type DaySchedule, type Weekday } from '@/types/branch';

/**
 * Render an `HH:MM` time as a 12-hour clock time (`9:00 AM`).
 *
 * Australian rosters are read in 12-hour time, while `<input type="time">` and
 * the database both speak 24-hour — so the conversion belongs here, at the edge.
 * Unparseable input returns null rather than throwing: a malformed stored value
 * should degrade to "not set", never break the page.
 */
export function formatTimeOfDay(value: string | null): string | null {
    if (!value) return null;

    try {
        const parsed = parse(value, 'HH:mm', new Date());
        if (Number.isNaN(parsed.getTime())) return null;

        return format(parsed, 'h:mm a');
    } catch {
        return null;
    }
}

/**
 * Whether a trading window runs past midnight.
 *
 * A close time at or before the open time is not an error — an 18:00–02:00 venue
 * is ordinary in hospitality — but it must be labelled, or "6:00 PM – 2:00 AM"
 * reads like a data-entry mistake.
 */
export function isOvernight(opensAt: string | null, closesAt: string | null): boolean {
    if (!opensAt || !closesAt) return false;

    return closesAt < opensAt;
}

/**
 * Render a trading window, e.g. `9:00 AM – 5:00 PM`.
 *
 * Returns null when either end is missing, which the caller shows as "not set".
 */
export function formatTradingWindow(
    opensAt: string | null,
    closesAt: string | null,
): string | null {
    const opens = formatTimeOfDay(opensAt);
    const closes = formatTimeOfDay(closesAt);

    if (!opens || !closes) return null;

    // En dash with hair spaces reads as a range rather than a subtraction.
    return `${opens} – ${closes}`;
}

/**
 * Render a duration in minutes as `45 min`, `1 hr` or `1 hr 30 min`.
 */
export function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    const hoursLabel = `${hours} hr`;

    return remainder === 0 ? hoursLabel : `${hoursLabel} ${remainder} min`;
}

/**
 * Describe a break, including whether it is paid time.
 *
 * `null` minutes means "never configured" and yields null, while an explicit `0`
 * means "no break" — a distinction that matters for pay, so the two must not
 * collapse into the same wording.
 */
export function formatBreak(minutes: number | null, isPaid: boolean): string | null {
    if (minutes === null) return null;
    if (minutes === 0) return 'No break';

    return `${formatDuration(minutes)} ${isPaid ? 'paid' : 'unpaid'} break`;
}

/**
 * Total paid hours for a day, expressed as a decimal (e.g. `7.5`).
 *
 * Unpaid breaks are deducted because that is the number that reaches payroll;
 * paid breaks are not. Returns null when the day is closed or has no hours yet,
 * so the caller can show "—" instead of a misleading `0`.
 */
export function paidHoursForDay(day: DaySchedule): number | null {
    if (!day.isOpen || !day.opensAt || !day.closesAt) return null;

    const [openHour, openMinute] = day.opensAt.split(':').map(Number);
    const [closeHour, closeMinute] = day.closesAt.split(':').map(Number);

    if ([openHour, openMinute, closeHour, closeMinute].some(Number.isNaN)) return null;

    const opensMinutes = openHour * 60 + openMinute;
    let closesMinutes = closeHour * 60 + closeMinute;

    // An overnight shift closes on the following day, so roll it forward rather
    // than reporting a negative span.
    if (closesMinutes <= opensMinutes) {
        closesMinutes += 24 * 60;
    }

    const unpaidBreak = day.breakPaid ? 0 : (day.breakMinutes ?? 0);
    const paidMinutes = closesMinutes - opensMinutes - unpaidBreak;

    return paidMinutes > 0 ? Math.round((paidMinutes / 60) * 100) / 100 : 0;
}

/**
 * Sum the week's paid hours — the headline figure for "what does this branch
 * cost to staff at its posted hours".
 */
export function paidHoursForWeek(days: Record<Weekday, DaySchedule>): number {
    const total = WEEKDAYS.reduce((sum, weekday) => sum + (paidHoursForDay(days[weekday]) ?? 0), 0);

    return Math.round(total * 100) / 100;
}

/**
 * The weekday it is *right now at the branch*, not in the viewer's timezone.
 *
 * A Perth branch viewed from Sydney can legitimately be on a different day, and
 * highlighting the wrong row would undermine trust in the whole panel. Falls
 * back to the viewer's own weekday if the branch has no usable timezone.
 */
export function currentWeekdayFor(timezone: string | null): Weekday | null {
    const date = new Date();

    if (timezone) {
        try {
            const name = new Intl.DateTimeFormat('en-AU', {
                weekday: 'long',
                timeZone: timezone,
            })
                .format(date)
                .toLowerCase();

            const match = WEEKDAYS.find((weekday) => weekday === name);
            if (match) return match;
        } catch {
            // An unknown IANA identifier falls through to the local weekday.
        }
    }

    // `getDay()` is Sunday-first; WEEKDAYS is Monday-first.
    const index = date.getDay();

    return index === 0 ? 'sunday' : (WEEKDAYS[index - 1] ?? null);
}

/**
 * Count the days that deviate from the branch's standard day.
 *
 * Drives the "3 days differ" hint, which tells a manager whether the standard
 * hours alone describe the week before they read all seven rows.
 */
export function countCustomDays(days: Record<Weekday, DaySchedule>): number {
    return WEEKDAYS.filter((weekday) => days[weekday].isCustom).length;
}
