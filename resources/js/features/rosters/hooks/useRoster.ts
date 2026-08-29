import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';
import { areIntervalsOverlapping, differenceInMinutes, parseISO } from 'date-fns';

import type {
    AvailabilityWindow,
    ConflictResult,
    RosterDepartment,
    RosterEmployee,
    RosterMetrics,
    Shift,
    ShiftInput,
} from '@/types/roster';

/**
 * Isolated mock data & network-simulation layer for the Roster module.
 *
 * Keeps all scheduling state/transport concerns here so the calendar render UI
 * stays purely presentational. Also exposes pure helpers for metric derivation
 * and availability conflict detection.
 */

/** Query cache key for the shift collection. */
export const SHIFTS_QUERY_KEY = ['roster', 'shifts'] as const;

/** Simulated network latency in milliseconds. */
const NETWORK_DELAY_MS = 400;

/** Employee lookup with simulated AUD wage rates. */
export const ROSTER_EMPLOYEES: readonly RosterEmployee[] = [
    { id: 'emp-001', name: 'Olivia Bennett', hourlyRate: 32.5 },
    { id: 'emp-002', name: 'Liam Nguyen', hourlyRate: 28.0 },
    { id: 'emp-004', name: 'Noah Patel', hourlyRate: 41.0 },
    { id: 'emp-005', name: 'Ava Thompson', hourlyRate: 30.75 },
];

/** Department lookup providing semantic colour themes. */
export const ROSTER_DEPARTMENTS: readonly RosterDepartment[] = [
    { id: 'dept-001', name: 'Front of House', colorTheme: 'primary' },
    { id: 'dept-002', name: 'Kitchen', colorTheme: 'warning' },
    { id: 'dept-003', name: 'Management', colorTheme: 'info' },
];

/** Approved leave / unavailability windows for conflict detection. */
export const AVAILABILITY_WINDOWS: readonly AvailabilityWindow[] = [
    {
        employeeId: 'emp-002',
        start: '2026-08-05T00:00:00',
        end: '2026-08-06T23:59:59',
        reason: 'Sick Leave',
    },
    {
        employeeId: 'emp-001',
        start: '2026-08-10T00:00:00',
        end: '2026-08-14T23:59:59',
        reason: 'Annual Leave',
    },
];

/** Compute the current week's Monday as an ISO date prefix for seed data. */
function seedDate(dayOffset: number, hour: number, minute = 0): string {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Move back to Monday.
    monday.setDate(now.getDate() + diff + dayOffset);
    monday.setHours(hour, minute, 0, 0);
    // Local ISO without timezone suffix so FullCalendar treats it as local.
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}T${pad(hour)}:${pad(minute)}:00`;
}

/** In-memory shift store, seeded for the current week. */
let shiftStore: Shift[] = [
    {
        id: 'shift-001',
        employeeId: 'emp-001',
        departmentId: 'dept-001',
        startTime: seedDate(0, 9),
        endTime: seedDate(0, 17),
        breakMinutes: 30,
        role: 'Barista',
        colorTheme: 'primary',
    },
    {
        id: 'shift-002',
        employeeId: 'emp-002',
        departmentId: 'dept-002',
        startTime: seedDate(0, 12),
        endTime: seedDate(0, 20),
        breakMinutes: 45,
        role: 'Line Cook',
        colorTheme: 'warning',
    },
    {
        id: 'shift-003',
        employeeId: 'emp-004',
        departmentId: 'dept-003',
        startTime: seedDate(1, 8),
        endTime: seedDate(1, 16),
        breakMinutes: 60,
        role: 'Shift Manager',
        colorTheme: 'info',
    },
    {
        id: 'shift-004',
        employeeId: 'emp-005',
        departmentId: 'dept-001',
        startTime: seedDate(2, 10),
        endTime: seedDate(2, 18),
        breakMinutes: 30,
        role: 'Waiter',
        colorTheme: 'primary',
    },
];

/** Resolves after {@link NETWORK_DELAY_MS} to emulate request latency. */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulated GET /rosters/shifts. */
async function fetchShifts(): Promise<Shift[]> {
    await delay(NETWORK_DELAY_MS);
    return [...shiftStore];
}

/** Resolves the semantic colour theme for a department id. */
function themeForDepartment(departmentId: string): Shift['colorTheme'] {
    return ROSTER_DEPARTMENTS.find((dept) => dept.id === departmentId)?.colorTheme ?? 'primary';
}

/** Simulated POST /rosters/shifts. */
async function createShift(input: ShiftInput): Promise<Shift> {
    await delay(NETWORK_DELAY_MS);

    const created: Shift = {
        id: `shift-${(shiftStore.length + 1).toString().padStart(3, '0')}-${Date.now()}`,
        employeeId: input.employeeId,
        departmentId: input.departmentId,
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        role: input.role,
        colorTheme: themeForDepartment(input.departmentId),
    };

    shiftStore = [...shiftStore, created];
    return created;
}

/** Simulated PATCH /rosters/shifts/:id. */
async function updateShift(id: string, input: Partial<ShiftInput>): Promise<Shift> {
    await delay(NETWORK_DELAY_MS);

    shiftStore = shiftStore.map((shift) =>
        shift.id === id
            ? {
                ...shift,
                ...input,
                colorTheme: input.departmentId
                    ? themeForDepartment(input.departmentId)
                    : shift.colorTheme,
            }
            : shift,
    );

    const updated = shiftStore.find((shift) => shift.id === id);
    if (!updated) throw new Error('Shift not found.');
    return updated;
}

/** Simulated DELETE /rosters/shifts/:id. */
async function deleteShift(id: string): Promise<void> {
    await delay(NETWORK_DELAY_MS);
    shiftStore = shiftStore.filter((shift) => shift.id !== id);
}

/** Reads all shifts for the roster. */
export function useShifts(): UseQueryResult<Shift[], Error> {
    return useQuery<Shift[], Error>({
        queryKey: SHIFTS_QUERY_KEY,
        queryFn: fetchShifts,
        staleTime: 15_000,
    });
}

/** Creates a shift and refreshes the roster cache. */
export function useCreateShift(): UseMutationResult<Shift, Error, ShiftInput> {
    const queryClient = useQueryClient();

    return useMutation<Shift, Error, ShiftInput>({
        mutationFn: createShift,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY });
        },
    });
}

/** Payload for the edit mutation. */
export interface UpdateShiftArgs {
    id: string;
    input: Partial<ShiftInput>;
}

/** Updates a shift (used by both the modal and drag/resize handlers). */
export function useUpdateShift(): UseMutationResult<Shift, Error, UpdateShiftArgs> {
    const queryClient = useQueryClient();

    return useMutation<Shift, Error, UpdateShiftArgs>({
        mutationFn: ({ id, input }) => updateShift(id, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY });
        },
    });
}

/** Deletes a shift and refreshes the roster cache. */
export function useDeleteShift(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteShift,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY });
        },
    });
}

/** Paid minutes for a single shift (duration minus unpaid break). */
function paidMinutes(shift: Shift): number {
    const gross = differenceInMinutes(parseISO(shift.endTime), parseISO(shift.startTime));
    return Math.max(gross - shift.breakMinutes, 0);
}

/**
 * Derives roster summary metrics: total paid hours, estimated labour cost
 * (using each employee's hourly rate), and active shift count. Pure function.
 */
export function deriveRosterMetrics(shifts: Shift[]): RosterMetrics {
    let totalMinutes = 0;
    let estimatedCost = 0;

    for (const shift of shifts) {
        const minutes = paidMinutes(shift);
        totalMinutes += minutes;

        const employee = ROSTER_EMPLOYEES.find((item) => item.id === shift.employeeId);
        const rate = employee?.hourlyRate ?? 0;
        estimatedCost += (minutes / 60) * rate;
    }

    return {
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
        shiftCount: shifts.length,
    };
}

/**
 * Evaluates whether a proposed shift interval conflicts with any approved leave
 * or unavailability window for the same employee. Pure function.
 */
export function detectConflict(
    employeeId: string,
    startTime: string,
    endTime: string,
    windows: readonly AvailabilityWindow[] = AVAILABILITY_WINDOWS,
): ConflictResult {
    const shiftInterval = { start: parseISO(startTime), end: parseISO(endTime) };

    for (const window of windows) {
        if (window.employeeId !== employeeId) continue;

        const windowInterval = { start: parseISO(window.start), end: parseISO(window.end) };
        if (areIntervalsOverlapping(shiftInterval, windowInterval)) {
            return { hasConflict: true, window };
        }
    }

    return { hasConflict: false };
}
