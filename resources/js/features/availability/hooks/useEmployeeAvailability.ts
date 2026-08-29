import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import {
    type AvailabilitySlot,
    type AvailabilitySyncSlot,
    type CreateAvailabilitySlotInput,
    type DayOfWeek,
    type UpdateAvailabilitySlotInput,
} from '@/types/employee-availability';

import { normalizeTime } from '../lib/availability-grid';

/**
 * Data-access layer for a single employee's weekly availability.
 *
 * Wraps the nested REST endpoints below and maps the Laravel resource payloads
 * into the app's {@link AvailabilitySlot} domain type. Components never touch
 * Axios or snake_case DTOs directly.
 *
 * - `GET    /v1/employees/{employee}/availabilities`
 * - `POST   /v1/employees/{employee}/availabilities`
 * - `PUT    /v1/employees/{employee}/availabilities/sync`
 * - `PUT    /v1/employees/{employee}/availabilities/{availability}`
 * - `DELETE /v1/employees/{employee}/availabilities/{availability}`
 */

/** Key registry so each employee's availability caches independently. */
export const AVAILABILITY_KEYS = {
    all: ['employee-availability'] as const,
    byEmployee: (employeeId: string) => ['employee-availability', employeeId] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror of EmployeeAvailabilityResource)                     */
/* -------------------------------------------------------------------------- */

/** Raw availability payload as serialized by the backend. */
interface AvailabilityDto {
    id: number;
    employee_id: number;
    day_of_week: number;
    day_name?: string | null;
    start_time: string | null;
    end_time: string | null;
    is_available: boolean | number | null;
}

/**
 * The index endpoint returns a plain collection, but sibling endpoints in this
 * API paginate. Accept either so a future change to `paginate()` cannot break
 * the editor.
 */
type AvailabilityIndexPayload = AvailabilityDto[] | { data: AvailabilityDto[] };

/** Narrow an unknown day index into the {@link DayOfWeek} union. */
function toDayOfWeek(value: number): DayOfWeek {
    const index = Math.min(6, Math.max(0, Math.trunc(value)));
    return index as DayOfWeek;
}

/** Map a DTO into the stable domain shape, trimming `HH:mm:ss` to `HH:mm`. */
function mapSlot(dto: AvailabilityDto): AvailabilitySlot {
    return {
        id: String(dto.id),
        employeeId: String(dto.employee_id),
        dayOfWeek: toDayOfWeek(dto.day_of_week),
        startTime: normalizeTime(dto.start_time ?? '00:00'),
        endTime: normalizeTime(dto.end_time ?? '24:00'),
        isAvailable: Boolean(dto.is_available ?? true),
    };
}

/** Unwrap either collection shape returned by the index endpoint. */
function unwrapIndex(payload: AvailabilityIndexPayload): AvailabilityDto[] {
    return Array.isArray(payload) ? payload : payload.data;
}

/** Convert a domain slot input into the backend's snake_case body. */
function toRequestBody(input: CreateAvailabilitySlotInput): Record<string, unknown> {
    return {
        day_of_week: input.dayOfWeek,
        // The backend validates `H:i`, so the exclusive end-of-day marker is
        // clamped to the last representable minute.
        start_time: input.startTime === '24:00' ? '23:59' : input.startTime,
        end_time: input.endTime === '24:00' ? '23:59' : input.endTime,
        is_available: input.isAvailable,
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** Base path for an employee's availability sub-resource. */
function basePath(employeeId: string): string {
    return `/employees/${employeeId}/availabilities`;
}

/** GET the employee's full weekly availability. */
async function fetchAvailability(employeeId: string): Promise<AvailabilitySlot[]> {
    const response = await apiClient.get<ApiSuccessResponse<AvailabilityIndexPayload>>(
        basePath(employeeId),
    );

    return unwrapIndex(response.data.data).map(mapSlot);
}

/** POST a single new availability slot. */
async function createSlot(
    employeeId: string,
    input: CreateAvailabilitySlotInput,
): Promise<AvailabilitySlot> {
    const response = await apiClient.post<ApiSuccessResponse<AvailabilityDto>>(
        basePath(employeeId),
        toRequestBody(input),
    );

    return mapSlot(response.data.data);
}

/** PUT an existing availability slot. */
async function updateSlot(
    employeeId: string,
    input: UpdateAvailabilitySlotInput,
): Promise<AvailabilitySlot> {
    const response = await apiClient.put<ApiSuccessResponse<AvailabilityDto>>(
        `${basePath(employeeId)}/${input.id}`,
        toRequestBody(input),
    );

    return mapSlot(response.data.data);
}

/** DELETE a single availability slot. */
async function deleteSlot(employeeId: string, slotId: string): Promise<void> {
    await apiClient.delete(`${basePath(employeeId)}/${slotId}`);
}

/**
 * PUT the whole week in one request.
 *
 * The backend replaces every existing slot with the supplied set, which is what
 * makes the "Save week" action atomic — a partially applied grid can never be
 * persisted.
 */
async function syncWeek(
    employeeId: string,
    slots: readonly AvailabilitySyncSlot[],
): Promise<AvailabilitySlot[]> {
    const response = await apiClient.put<ApiSuccessResponse<AvailabilityIndexPayload>>(
        `${basePath(employeeId)}/sync`,
        {
            availabilities: slots.map((slot) => ({
                day_of_week: slot.dayOfWeek,
                start_time: slot.startTime,
                end_time: slot.endTime,
                is_available: slot.isAvailable,
            })),
        },
    );

    return unwrapIndex(response.data.data).map(mapSlot);
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reads one employee's weekly availability. Disabled until an id is present so
 * the editor can mount before the route param resolves.
 */
export function useEmployeeAvailability(
    employeeId: string,
): UseQueryResult<AvailabilitySlot[], Error> {
    return useQuery<AvailabilitySlot[], Error>({
        queryKey: AVAILABILITY_KEYS.byEmployee(employeeId),
        queryFn: () => fetchAvailability(employeeId),
        enabled: employeeId.length > 0,
        staleTime: 30_000,
    });
}

/** Creates one availability slot and refreshes the week. */
export function useCreateAvailabilitySlot(
    employeeId: string,
): UseMutationResult<AvailabilitySlot, Error, CreateAvailabilitySlotInput> {
    const queryClient = useQueryClient();

    return useMutation<AvailabilitySlot, Error, CreateAvailabilitySlotInput>({
        mutationFn: (input) => createSlot(employeeId, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: AVAILABILITY_KEYS.byEmployee(employeeId),
            });
        },
    });
}

/** Updates one availability slot and refreshes the week. */
export function useUpdateAvailabilitySlot(
    employeeId: string,
): UseMutationResult<AvailabilitySlot, Error, UpdateAvailabilitySlotInput> {
    const queryClient = useQueryClient();

    return useMutation<AvailabilitySlot, Error, UpdateAvailabilitySlotInput>({
        mutationFn: (input) => updateSlot(employeeId, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: AVAILABILITY_KEYS.byEmployee(employeeId),
            });
        },
    });
}

/** Deletes one availability slot and refreshes the week. */
export function useDeleteAvailabilitySlot(
    employeeId: string,
): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: (slotId) => deleteSlot(employeeId, slotId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: AVAILABILITY_KEYS.byEmployee(employeeId),
            });
        },
    });
}

/**
 * Replaces the employee's entire week.
 *
 * The server response is written straight back into the cache so the editor
 * immediately re-seeds its draft with real server ids (no extra round trip).
 */
export function useSyncWeeklyAvailability(
    employeeId: string,
): UseMutationResult<AvailabilitySlot[], Error, readonly AvailabilitySyncSlot[]> {
    const queryClient = useQueryClient();

    return useMutation<AvailabilitySlot[], Error, readonly AvailabilitySyncSlot[]>({
        mutationFn: (slots) => syncWeek(employeeId, slots),
        onSuccess: (slots) => {
            queryClient.setQueryData(AVAILABILITY_KEYS.byEmployee(employeeId), slots);
        },
    });
}
