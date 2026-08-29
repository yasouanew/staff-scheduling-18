import { WEEKDAYS, type Branch, type Weekday } from '@/types/branch';

import type { BranchFormInput } from '../schemas';

/**
 * Default values for the branch form.
 *
 * Seeding lives here rather than in the modal so the "API shape -> form shape"
 * translation is testable on its own and the modal stays presentational.
 */

/** A weekday row in the form's raw (pre-validation) shape. */
type DayScheduleInput = BranchFormInput['daySchedules'][Weekday];

/**
 * A weekday that simply follows the branch's standard hours.
 *
 * The time fields are blank rather than pre-filled with the default: the row is
 * disabled while `useDefault` is on, and showing an editable-looking copy of the
 * standard hours invites the reader to think they can change it there.
 */
function inheritedDay(): DayScheduleInput {
    return {
        useDefault: true,
        isOpen: true,
        opensAt: '',
        closesAt: '',
        breakMinutes: '',
        breakPayType: 'unpaid',
    };
}

/** Every weekday inheriting the standard day — the state for a new branch. */
function emptyWeek(): BranchFormInput['daySchedules'] {
    return WEEKDAYS.reduce(
        (week, weekday) => ({ ...week, [weekday]: inheritedDay() }),
        {} as BranchFormInput['daySchedules'],
    );
}

/** Blank form state for creating a branch. */
export const EMPTY_BRANCH_FORM: BranchFormInput = {
    name: '',
    managerId: '',
    phone: '',
    address: '',
    timezone: 'Australia/Sydney',
    status: 'active',
    defaultOpensAt: '',
    defaultClosesAt: '',
    defaultBreakMinutes: '',
    defaultBreakPayType: 'unpaid',
    daySchedules: emptyWeek(),
};

/**
 * Translate an existing branch into form state.
 *
 * Only days flagged `isCustom` by the API are shown as overrides. The rest are
 * reset to the inherited state so that re-saving an untouched branch cannot
 * accidentally freeze today's default hours onto all seven days.
 */
export function toBranchFormDefaults(branch: Branch | null | undefined): BranchFormInput {
    if (!branch) {
        return EMPTY_BRANCH_FORM;
    }

    const daySchedules = WEEKDAYS.reduce((week, weekday) => {
        const day = branch.daySchedules[weekday];

        week[weekday] = day?.isCustom
            ? {
                useDefault: false,
                isOpen: day.isOpen,
                opensAt: day.opensAt ?? '',
                closesAt: day.closesAt ?? '',
                breakMinutes: day.breakMinutes ?? '',
                breakPayType: day.breakPaid ? 'paid' : 'unpaid',
            }
            : inheritedDay();

        return week;
    }, {} as BranchFormInput['daySchedules']);

    return {
        name: branch.name,
        managerId: branch.managerId ?? '',
        phone: branch.phone ?? '',
        address: branch.address ?? '',
        timezone: branch.timezone ?? 'Australia/Sydney',
        status: branch.status,
        defaultOpensAt: branch.defaultOpensAt ?? '',
        defaultClosesAt: branch.defaultClosesAt ?? '',
        defaultBreakMinutes: branch.defaultBreakMinutes ?? '',
        defaultBreakPayType: branch.defaultBreakPaid ? 'paid' : 'unpaid',
        daySchedules,
    };
}
