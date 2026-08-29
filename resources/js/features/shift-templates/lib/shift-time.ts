/**
 * Pure time maths for shift templates.
 *
 * Everything here is side-effect free and framework agnostic: parsing `HH:mm`
 * strings, computing a shift span (including overnight shifts that wrap past
 * midnight), deriving payable hours from the break settings, and projecting the
 * shift onto a 24-hour track for the visual preview. Keeping this logic out of
 * the components lets the UI stay purely presentational and makes the rules
 * trivially verifiable.
 */

/** Minutes in a full day. */
export const MINUTES_IN_DAY = 1440;

/** Matches a strict 24-hour `HH:mm` time string. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True when `value` is a valid 24-hour `HH:mm` string. */
export function isValidTime(value: string): boolean {
    return TIME_PATTERN.test(value.trim());
}

/**
 * Normalise a stored time into `HH:mm`.
 *
 * The backend may return `HH:mm:ss` (MySQL TIME columns) so the seconds portion
 * is trimmed. Unparseable values are returned untouched.
 */
export function normalizeTime(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    const trimmed = value.trim();
    const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);

    if (!match) {
        return trimmed;
    }

    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** Convert `HH:mm` into minutes past midnight (NaN when invalid). */
export function timeToMinutes(value: string): number {
    const match = TIME_PATTERN.exec(normalizeTime(value));

    if (!match) {
        return Number.NaN;
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

/** Convert minutes past midnight into a padded `HH:mm` string. */
export function minutesToTime(minutes: number): string {
    const wrapped = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    const hours = Math.floor(wrapped / 60);
    const mins = wrapped % 60;

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Format a stored time for display as a 12-hour label (e.g. `9:00 am`).
 *
 * Reads far better than 24-hour values in dense tables and preview cards.
 */
export function formatTimeLabel(value: string | null | undefined): string {
    const normalized = normalizeTime(value);
    const minutes = timeToMinutes(normalized);

    if (Number.isNaN(minutes)) {
        return normalized || '—';
    }

    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const suffix = hours24 >= 12 ? 'pm' : 'am';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

    return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/** `9:00 am – 5:30 pm` style range label. */
export function formatTimeRange(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
): string {
    return `${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}`;
}

/**
 * Total length of the shift in minutes.
 *
 * When the end time is at or before the start time the shift is treated as
 * overnight and rolls into the following day. Returns NaN when either time is
 * unparseable and 0 when the two times are identical.
 */
export function computeSpanMinutes(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
): number {
    const start = timeToMinutes(normalizeTime(startTime));
    const end = timeToMinutes(normalizeTime(endTime));

    if (Number.isNaN(start) || Number.isNaN(end)) {
        return Number.NaN;
    }

    if (end === start) {
        return 0;
    }

    return end > start ? end - start : MINUTES_IN_DAY - start + end;
}

/** True when the shift finishes on the next calendar day. */
export function isOvernight(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
): boolean {
    const start = timeToMinutes(normalizeTime(startTime));
    const end = timeToMinutes(normalizeTime(endTime));

    if (Number.isNaN(start) || Number.isNaN(end)) {
        return false;
    }

    return end < start;
}

/** Payable minutes once an unpaid break is deducted. */
export function computePaidMinutes(
    spanMinutes: number,
    breakMinutes: number,
    isPaidBreak: boolean,
): number {
    if (Number.isNaN(spanMinutes)) {
        return Number.NaN;
    }

    if (isPaidBreak) {
        return spanMinutes;
    }

    return Math.max(0, spanMinutes - Math.max(0, breakMinutes));
}

/** Format a minute count as a compact duration label, e.g. `8h 30m`. */
export function formatDuration(minutes: number): string {
    if (Number.isNaN(minutes) || minutes < 0) {
        return '—';
    }

    if (minutes === 0) {
        return '0m';
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
        return `${mins}m`;
    }

    if (mins === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${mins}m`;
}

/** Format payable minutes as decimal hours, e.g. `7.5 hrs`. */
export function formatPaidHours(minutes: number): string {
    if (Number.isNaN(minutes) || minutes < 0) {
        return '—';
    }

    const hours = minutes / 60;
    const rounded = Math.round(hours * 100) / 100;

    return `${rounded} ${rounded === 1 ? 'hr' : 'hrs'}`;
}

/** Describe the break configuration, e.g. `30m unpaid` or `No break`. */
export function describeBreak(breakMinutes: number, isPaidBreak: boolean): string {
    if (!breakMinutes) {
        return 'No break';
    }

    return `${formatDuration(breakMinutes)} ${isPaidBreak ? 'paid' : 'unpaid'}`;
}

/** A single block of the shift projected onto a 24-hour track (percentages). */
export interface TimelineSegment {
    /** Distance from the left edge of the track, as a percentage. */
    leftPercent: number;
    /** Width of the block, as a percentage of the full day. */
    widthPercent: number;
}

/**
 * Project the shift onto a 24-hour track.
 *
 * Overnight shifts produce two segments: one running to midnight and one
 * starting again at 00:00, which reads naturally on a single-day track.
 */
export function buildTimelineSegments(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
): TimelineSegment[] {
    const start = timeToMinutes(normalizeTime(startTime));
    const span = computeSpanMinutes(startTime, endTime);

    if (Number.isNaN(start) || Number.isNaN(span) || span <= 0) {
        return [];
    }

    const toPercent = (value: number): number => (value / MINUTES_IN_DAY) * 100;
    const firstLength = Math.min(span, MINUTES_IN_DAY - start);

    const segments: TimelineSegment[] = [
        { leftPercent: toPercent(start), widthPercent: toPercent(firstLength) },
    ];

    const remaining = span - firstLength;

    if (remaining > 0) {
        segments.push({
            leftPercent: 0,
            widthPercent: toPercent(Math.min(remaining, MINUTES_IN_DAY)),
        });
    }

    return segments;
}

/** Hour ticks (every 6 hours) rendered under the preview track. */
export const TIMELINE_TICKS = [
    { label: '12a', percent: 0 },
    { label: '6a', percent: 25 },
    { label: '12p', percent: 50 },
    { label: '6p', percent: 75 },
    { label: '12a', percent: 100 },
] as const;
