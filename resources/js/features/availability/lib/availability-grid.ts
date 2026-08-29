import {
    DAY_ORDER,
    GRID_SLOT_COUNT,
    GRID_SLOT_MINUTES,
    MINUTES_IN_DAY,
    type AvailabilityRange,
    type AvailabilitySlot,
    type AvailabilitySyncSlot,
    type DayOfWeek,
    type WeeklyAvailabilityDraft,
    type WeeklySelection,
} from '@/types/employee-availability';

/**
 * Pure time-grid maths for the weekly availability editor.
 *
 * Everything here is side-effect free and framework agnostic: converting
 * `HH:mm` strings to minutes, translating persisted slots into a 48-column
 * boolean grid, collapsing a drag selection back into merged ranges, and
 * detecting overlaps. Keeping this logic out of the components lets the UI stay
 * purely presentational and makes the rules trivially verifiable.
 */

/* -------------------------------------------------------------------------- */
/* Time conversion                                                            */
/* -------------------------------------------------------------------------- */

/** Matches a strict 24-hour `HH:mm` time string. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True when `value` is a valid 24-hour `HH:mm` string. */
export function isValidTime(value: string): boolean {
    return TIME_PATTERN.test(value);
}

/**
 * Convert `HH:mm` into minutes past midnight.
 *
 * `'24:00'` is accepted as an exclusive end-of-day marker (1440) so a range can
 * cover the final slot of the day without wrapping into the next one.
 */
export function timeToMinutes(value: string): number {
    if (value === '24:00') {
        return MINUTES_IN_DAY;
    }

    const match = TIME_PATTERN.exec(value.trim());
    if (!match) {
        return Number.NaN;
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

/** Convert minutes past midnight into a padded `HH:mm` string. */
export function minutesToTime(minutes: number): string {
    const clamped = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minutes)));

    if (clamped === MINUTES_IN_DAY) {
        return '24:00';
    }

    const hours = Math.floor(clamped / 60);
    const mins = clamped % 60;

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Format a stored time for display, tolerating the backend's `HH:mm:ss`.
 *
 * Returns a 12-hour label (e.g. `9:00 am`, `5:30 pm`) which reads far better in
 * a dense weekly grid than 24-hour values.
 */
export function formatTimeLabel(value: string): string {
    const minutes = timeToMinutes(normalizeTime(value));

    if (Number.isNaN(minutes)) {
        return value;
    }

    if (minutes === MINUTES_IN_DAY) {
        return '12:00 am';
    }

    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const suffix = hours24 < 12 ? 'am' : 'pm';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

    return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/** Trim a backend `HH:mm:ss` (or `HH:mm`) value down to `HH:mm`. */
export function normalizeTime(value: string): string {
    const trimmed = value.trim();
    return trimmed.length > 5 ? trimmed.slice(0, 5) : trimmed;
}

/** Human duration for a range, e.g. `7h 30m`. */
export function formatDuration(startTime: string, endTime: string): string {
    const total = timeToMinutes(endTime) - timeToMinutes(startTime);

    if (!Number.isFinite(total) || total <= 0) {
        return '0h';
    }

    const hours = Math.floor(total / 60);
    const minutes = total % 60;

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;

    return `${hours}h ${minutes}m`;
}

/** Total availability minutes across every active range in the draft. */
export function totalDraftMinutes(draft: WeeklyAvailabilityDraft): number {
    return DAY_ORDER.reduce<number>((weekTotal, day) => {
        const dayTotal = draft[day]
            .filter((range) => range.isAvailable)
            .reduce<number>(
                (sum, range) =>
                    sum + Math.max(0, timeToMinutes(range.endTime) - timeToMinutes(range.startTime)),
                0,
            );

        return weekTotal + dayTotal;
    }, 0);
}

/* -------------------------------------------------------------------------- */
/* Slot index helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Grid column index (0–47) containing the given minute value. */
export function minutesToSlotIndex(minutes: number): number {
    return Math.max(0, Math.min(GRID_SLOT_COUNT - 1, Math.floor(minutes / GRID_SLOT_MINUTES)));
}

/** Inclusive start minute of a grid column. */
export function slotIndexToMinutes(index: number): number {
    return index * GRID_SLOT_MINUTES;
}

/** `HH:mm` label for a grid column's start edge. */
export function slotStartTime(index: number): string {
    return minutesToTime(slotIndexToMinutes(index));
}

/** `HH:mm` label for a grid column's end edge. */
export function slotEndTime(index: number): string {
    return minutesToTime(slotIndexToMinutes(index + 1));
}

/** Hour tick labels (every 2 hours) used along the grid's time axis. */
export function hourTicks(): readonly { index: number; label: string }[] {
    const ticks: { index: number; label: string }[] = [];

    for (let hour = 0; hour < 24; hour += 2) {
        ticks.push({ index: (hour * 60) / GRID_SLOT_MINUTES, label: formatTimeLabel(minutesToTime(hour * 60)) });
    }

    return ticks;
}

/* -------------------------------------------------------------------------- */
/* Draft construction                                                         */
/* -------------------------------------------------------------------------- */

/** Monotonic counter backing {@link createRangeKey}. */
let rangeKeyCounter = 0;

/** Stable client-only identity for a draft range. */
export function createRangeKey(): string {
    rangeKeyCounter += 1;
    return `range-${rangeKeyCounter}`;
}

/** An empty draft with an entry for every day of the week. */
export function createEmptyDraft(): WeeklyAvailabilityDraft {
    return {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
    };
}

/** Order ranges chronologically by start time. */
function byStartTime(a: AvailabilityRange, b: AvailabilityRange): number {
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
}

/**
 * Build an editable draft from the persisted slots.
 *
 * Slots missing a start/end (the backend allows nulls to model a whole-day
 * unavailable marker) are normalised to a full-day range so the grid can always
 * render them.
 */
export function slotsToDraft(slots: readonly AvailabilitySlot[]): WeeklyAvailabilityDraft {
    const draft = createEmptyDraft();

    for (const slot of slots) {
        const startTime = normalizeTime(slot.startTime || '00:00');
        const endTime = normalizeTime(slot.endTime || '24:00');

        draft[slot.dayOfWeek].push({
            key: createRangeKey(),
            serverId: slot.id,
            startTime,
            endTime,
            isAvailable: slot.isAvailable,
        });
    }

    for (const day of DAY_ORDER) {
        draft[day].sort(byStartTime);
    }

    return draft;
}

/** Deep-clone a draft so state updates never mutate the previous value. */
export function cloneDraft(draft: WeeklyAvailabilityDraft): WeeklyAvailabilityDraft {
    const next = createEmptyDraft();

    for (const day of DAY_ORDER) {
        next[day] = draft[day].map((range) => ({ ...range }));
    }

    return next;
}

/* -------------------------------------------------------------------------- */
/* Grid <-> ranges translation                                                */
/* -------------------------------------------------------------------------- */

/** A row of 48 `false` columns. */
function emptyRow(): boolean[] {
    return new Array<boolean>(GRID_SLOT_COUNT).fill(false);
}

/** Project the draft's *available* ranges onto the boolean selection grid. */
export function draftToSelection(draft: WeeklyAvailabilityDraft): WeeklySelection {
    const selection: WeeklySelection = {
        0: emptyRow(),
        1: emptyRow(),
        2: emptyRow(),
        3: emptyRow(),
        4: emptyRow(),
        5: emptyRow(),
        6: emptyRow(),
    };

    for (const day of DAY_ORDER) {
        for (const range of draft[day]) {
            if (!range.isAvailable) continue;

            const from = minutesToSlotIndex(timeToMinutes(range.startTime));
            const toExclusive = Math.ceil(timeToMinutes(range.endTime) / GRID_SLOT_MINUTES);

            for (let index = from; index < toExclusive && index < GRID_SLOT_COUNT; index += 1) {
                selection[day][index] = true;
            }
        }
    }

    return selection;
}

/**
 * Collapse a row of selected columns into merged, chronologically ordered
 * ranges. Adjacent columns are always merged so a drag across 09:00–17:00
 * produces one range rather than sixteen.
 */
export function selectionRowToRanges(row: readonly boolean[]): { startTime: string; endTime: string }[] {
    const ranges: { startTime: string; endTime: string }[] = [];
    let runStart: number | null = null;

    for (let index = 0; index <= row.length; index += 1) {
        const selected = index < row.length && row[index];

        if (selected && runStart === null) {
            runStart = index;
        } else if (!selected && runStart !== null) {
            ranges.push({ startTime: slotStartTime(runStart), endTime: slotEndTime(index - 1) });
            runStart = null;
        }
    }

    return ranges;
}

/**
 * Rebuild a day's ranges from its grid row, preserving server ids where a new
 * range still starts at the same time as an existing one. That lets the sync
 * layer issue a cheap `PUT` for a resized block instead of delete + create.
 *
 * Explicit unavailable ranges are untouched by grid edits — the grid only ever
 * expresses positive availability.
 */
export function applySelectionRowToDay(
    row: readonly boolean[],
    existing: readonly AvailabilityRange[],
): AvailabilityRange[] {
    const unavailable = existing.filter((range) => !range.isAvailable);
    const previousAvailable = existing.filter((range) => range.isAvailable);

    const rebuilt = selectionRowToRanges(row).map((range) => {
        const matched = previousAvailable.find((candidate) => candidate.startTime === range.startTime);

        return {
            key: matched?.key ?? createRangeKey(),
            serverId: matched?.serverId ?? null,
            startTime: range.startTime,
            endTime: range.endTime,
            isAvailable: true,
        } satisfies AvailabilityRange;
    });

    return [...rebuilt, ...unavailable].sort(byStartTime);
}

/* -------------------------------------------------------------------------- */
/* Overlap validation                                                         */
/* -------------------------------------------------------------------------- */

/** Outcome of an overlap check against a day's existing ranges. */
export interface OverlapCheck {
    /** True when the candidate range collides with an existing one. */
    hasOverlap: boolean;
    /** The first colliding range, when there is one. */
    conflict: AvailabilityRange | null;
}

/**
 * Determine whether `candidate` overlaps any range already on the day.
 *
 * Ranges are treated as half-open `[start, end)` intervals so a block ending at
 * 12:00 and another starting at 12:00 are considered adjacent, not overlapping.
 * `ignoreKey` lets the form exclude the range currently being edited.
 */
export function findOverlap(
    ranges: readonly AvailabilityRange[],
    candidate: { startTime: string; endTime: string },
    ignoreKey?: string,
): OverlapCheck {
    const start = timeToMinutes(candidate.startTime);
    const end = timeToMinutes(candidate.endTime);

    const conflict =
        ranges.find((range) => {
            if (ignoreKey && range.key === ignoreKey) return false;

            const rangeStart = timeToMinutes(range.startTime);
            const rangeEnd = timeToMinutes(range.endTime);

            return start < rangeEnd && end > rangeStart;
        }) ?? null;

    return { hasOverlap: conflict !== null, conflict };
}

/**
 * Insert a range into a day, merging it with any ranges it touches or overlaps
 * so the result is always a normalised, non-overlapping set. Used by the grid's
 * drag-to-select and by the copy-to-days bulk action, where a pasted block may
 * legitimately butt up against an existing one.
 */
export function mergeRangeIntoDay(
    existing: readonly AvailabilityRange[],
    candidate: { startTime: string; endTime: string; isAvailable: boolean },
): AvailabilityRange[] {
    const sameKind = existing.filter((range) => range.isAvailable === candidate.isAvailable);
    const otherKind = existing.filter((range) => range.isAvailable !== candidate.isAvailable);

    let start = timeToMinutes(candidate.startTime);
    let end = timeToMinutes(candidate.endTime);

    /** Ranges that survive untouched, plus a preserved id for the merged block. */
    const untouched: AvailabilityRange[] = [];
    let inheritedKey: string | null = null;
    let inheritedServerId: string | null = null;

    for (const range of sameKind) {
        const rangeStart = timeToMinutes(range.startTime);
        const rangeEnd = timeToMinutes(range.endTime);

        // Touching (>=) rather than strictly overlapping (>) so 09:00–12:00 and
        // 12:00–17:00 collapse into a single 09:00–17:00 block.
        const touches = start <= rangeEnd && end >= rangeStart;

        if (touches) {
            start = Math.min(start, rangeStart);
            end = Math.max(end, rangeEnd);

            if (inheritedKey === null) {
                inheritedKey = range.key;
                inheritedServerId = range.serverId;
            }
        } else {
            untouched.push(range);
        }
    }

    const merged: AvailabilityRange = {
        key: inheritedKey ?? createRangeKey(),
        serverId: inheritedServerId,
        startTime: minutesToTime(start),
        endTime: minutesToTime(end),
        isAvailable: candidate.isAvailable,
    };

    return [...untouched, merged, ...otherKind].sort(byStartTime);
}

/* -------------------------------------------------------------------------- */
/* Sync payload                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Flatten a draft into the array expected by
 * `PUT /v1/employees/{employee}/availabilities/sync`.
 *
 * The backend validates `end_time` with `date_format:H:i`, so an exclusive
 * `24:00` end marker is clamped to `23:59` on the wire.
 */
export function draftToSyncPayload(draft: WeeklyAvailabilityDraft): AvailabilitySyncSlot[] {
    const payload: AvailabilitySyncSlot[] = [];

    for (const day of DAY_ORDER) {
        for (const range of draft[day]) {
            payload.push({
                dayOfWeek: day,
                startTime: range.startTime === '24:00' ? '23:59' : range.startTime,
                endTime: range.endTime === '24:00' ? '23:59' : range.endTime,
                isAvailable: range.isAvailable,
            });
        }
    }

    return payload;
}

/** Count of ranges across the whole draft. */
export function countRanges(draft: WeeklyAvailabilityDraft): number {
    return DAY_ORDER.reduce<number>((total, day) => total + draft[day].length, 0);
}

/**
 * Structural comparison of two drafts, ignoring client-only keys.
 *
 * Backs the editor's dirty tracking: the Sync button stays disabled and the
 * unsaved-changes warning stays hidden until something meaningfully differs
 * from the server state.
 */
export function draftsAreEqual(a: WeeklyAvailabilityDraft, b: WeeklyAvailabilityDraft): boolean {
    return DAY_ORDER.every((day) => {
        const left = a[day];
        const right = b[day];

        if (left.length !== right.length) return false;

        return left.every((range, index) => {
            const other = right[index];

            return (
                range.startTime === other.startTime &&
                range.endTime === other.endTime &&
                range.isAvailable === other.isAvailable
            );
        });
    });
}

/** Days that currently hold at least one range. */
export function daysWithRanges(draft: WeeklyAvailabilityDraft): DayOfWeek[] {
    return DAY_ORDER.filter((day) => draft[day].length > 0);
}
