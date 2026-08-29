import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import {
    apiClient,
    type ApiSuccessResponse,
    type PaginatedCollection,
} from '@/lib/api-client';
import {
    NO_DEPARTMENT_LABEL,
    type CreateEmployeeInput,
    type Employee,
    type EmployeeInvitation,
    type EmployeeListParams,
    type EmployeeRole,
    type EmployeeStats,
    type EmployeeStatus,
    type EmploymentType,
    type InvitationChannel,
    type SendInvitationInput,
    type SendInvitationResult,
    type UpdateEmployeeInput,
} from '@/types/employee';



/**
 * Data-access layer for the Employee Directory.
 *
 * All transport concerns live here behind the exported hooks: components call
 * {@link useEmployees} / {@link useCreateEmployee} and never touch Axios or the
 * backend DTO shape directly. Server responses (Laravel API Resources) are
 * mapped into the app's stable {@link Employee} domain type before they ever
 * reach the presentation layer.
 */

/** Query cache key namespace for employee data. */
export const EMPLOYEES_QUERY_KEY = ['employees'] as const;

/** Key registry so each filtered directory read is cached independently. */
export const EMPLOYEES_KEYS = {
    all: EMPLOYEES_QUERY_KEY,
    list: (params: EmployeeListParams) => ['employees', 'list', params] as const,
    detail: (id: string) => ['employees', 'detail', id] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror of the backend EmployeeResource)                    */
/* -------------------------------------------------------------------------- */

/** Minimal `{ id, name }` shape shared by department/position/branch relations. */
interface NamedRefDto {
    id: number;
    name: string;
}

/** Subset of the linked user account exposed on an employee. */
interface EmployeeUserDto {
    id: number;
    name: string;
    email: string;
    role?: string | null;
}

/** Raw invitation payload as serialized by `EmployeeInvitationResource`. */
interface EmployeeInvitationDto {
    email: string;
    role: string;
    channel: string;
    status: string;
    expires_at: string | null;
    last_sent_at: string | null;
}


/** Raw employee payload as serialized by `EmployeeResource`. */
interface EmployeeDto {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string | null;
    employee_number: string | null;
    employment_type: string | null;
    hire_date: string | null;
    hourly_rate: string | number | null;
    photo_url: string | null;
    status: string | null;
    user?: EmployeeUserDto | null;
    department?: NamedRefDto | null;
    position?: NamedRefDto | null;
    branch?: NamedRefDto | null;
    invitation?: EmployeeInvitationDto | null;
    created_at: string | null;
}


/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                      */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend status into the UI's status union. */
function normalizeStatus(raw: string | null | undefined): EmployeeStatus {
    switch (raw) {
        case 'active':
            return 'active';
        case 'pending':
        case 'invited':
            return 'pending';
        default:
            return 'inactive';
    }
}


/** Coerce a backend employment type into the UI union, defaulting sensibly. */
function normalizeEmploymentType(raw: string | null | undefined): EmploymentType {
    switch (raw) {
        case 'part_time':
        case 'casual':
        case 'contract':
            return raw;
        default:
            return 'full_time';
    }
}

/** Coerce a backend role string into the UI union, or `null` when unknown. */
function normalizeRole(raw: string | null | undefined): EmployeeRole | null {
    switch (raw) {
        case 'company_admin':
        case 'scheduler':
        case 'employee':
            return raw;
        default:
            return null;
    }
}

/**
 * Map the invitation relation, dropping anything unrecognised.
 *
 * Returning `null` for an absent or malformed payload keeps the row menu's
 * "Send invite" vs "Resend invite" decision a simple null check.
 */
function mapInvitation(dto: EmployeeInvitationDto | null | undefined): EmployeeInvitation | null {
    if (!dto) return null;

    const status =
        dto.status === 'pending' || dto.status === 'expired' || dto.status === 'accepted'
            ? dto.status
            : null;

    if (status === null) return null;

    return {
        status,
        channel: (dto.channel === 'web' ? 'web' : 'mobile') satisfies InvitationChannel,
        role: normalizeRole(dto.role) ?? 'employee',
        email: dto.email,
        lastSentAt: dto.last_sent_at,
        expiresAt: dto.expires_at,
    };
}

/**
 * Convert a raw {@link EmployeeDto} into the stable {@link Employee} domain
 * shape. `joinedDate` is guaranteed to be a valid ISO date so downstream
 * `parseISO`/`format` calls in the table never receive an invalid value.
 *
 * Branch data is preserved as a real `{ id, name }` pair so the directory can
 * filter by branch and deep-link into `/branches/:id`.
 */
function mapEmployee(dto: EmployeeDto): Employee {
    const fullName =
        dto.full_name?.trim() ||
        `${dto.first_name ?? ''} ${dto.last_name ?? ''}`.trim() ||
        dto.user?.name ||
        'Unnamed employee';

    return {
        id: String(dto.id),
        name: fullName,
        email: dto.user?.email ?? '',
        avatarUrl: dto.photo_url ?? undefined,
        position: dto.position?.name ?? '—',
        // The department name is shown verbatim; each company defines its own.
        department: dto.department?.name ?? NO_DEPARTMENT_LABEL,
        departmentId: dto.department ? String(dto.department.id) : null,
        branchId: dto.branch ? String(dto.branch.id) : null,

        branchName: dto.branch?.name ?? null,
        status: normalizeStatus(dto.status),
        joinedDate: dto.hire_date ?? dto.created_at ?? new Date().toISOString(),
        positionId: dto.position ? String(dto.position.id) : null,
        employmentType: normalizeEmploymentType(dto.employment_type),
        hourlyRate: dto.hourly_rate === null || dto.hourly_rate === undefined
            ? null
            : String(dto.hourly_rate),
        // Prefer the invitation's role: it reflects the access the person was
        // last granted even before they have accepted and the account exists.
        role: normalizeRole(dto.invitation?.role ?? dto.user?.role),
        invitation: mapInvitation(dto.invitation),
    };
}


/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/v1/employees — returns the mapped directory collection.
 *
 * Branch/status narrowing is delegated to the backend so large directories are
 * never transferred in full just to be filtered on the client.
 */
async function fetchEmployees(params: EmployeeListParams = {}): Promise<Employee[]> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<EmployeeDto>>>(
        '/employees',
        {
            params: {
                branch_id: params.branchId || undefined,
                department_id: params.departmentId || undefined,
                status: params.status || undefined,
                per_page: params.perPage ?? 100,
            },

        },
    );

    return response.data.data.data.map(mapEmployee);
}

/**
 * POST /api/v1/employees/invite — creates a new employee *with a login*.
 *
 * The `invite` endpoint is used rather than the plain `employees` store route
 * because only the former also provisions the linked user account, assigns the
 * chosen role and emails an invitation to set a password. Posting to
 * `/employees` would create a profile with no credentials, so the selected role
 * would grant no access and the person could never sign in.
 *
 * The current {@link CreateEmployeeInput} carries a human-readable name; the
 * backend derives the owning company from the authenticated user, so we split
 * the display name into first/last and forward the assignment foreign keys.
 */
async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    const response = await apiClient.post<ApiSuccessResponse<EmployeeDto>>('/employees/invite', {
        first_name: firstName,
        last_name: lastName,
        email: input.email,
        // Drives what the person can reach once they accept the invitation.
        role: input.role,
        // Assignments are persisted as foreign keys; sending names silently discards them.
        department_id: input.departmentId ? Number(input.departmentId) : null,
        position_id: input.positionId ? Number(input.positionId) : null,
        branch_id: input.branchId ? Number(input.branchId) : null,
        employment_type: 'full_time',

    });

    return mapEmployee(response.data.data);
}


/**
 * PUT /api/v1/employees/{employee} — persists profile edits from the row menu.
 *
 * Empty selects are sent as `null` rather than omitted so clearing an
 * assignment actually unsets the foreign key instead of silently keeping the
 * previous value.
 */
async function updateEmployee({
    employeeId,
    input,
}: {
    employeeId: string;
    input: UpdateEmployeeInput;
}): Promise<Employee> {
    const response = await apiClient.put<ApiSuccessResponse<EmployeeDto>>(
        `/employees/${employeeId}`,
        {
            first_name: input.firstName.trim(),
            last_name: input.lastName.trim(),
            department_id: input.departmentId ? Number(input.departmentId) : null,
            position_id: input.positionId ? Number(input.positionId) : null,
            branch_id: input.branchId ? Number(input.branchId) : null,
            employment_type: input.employmentType,
            hourly_rate: input.hourlyRate.trim() === '' ? null : Number(input.hourlyRate),
            status: input.status,
        },
    );

    return mapEmployee(response.data.data);
}

/**
 * POST /api/v1/employees/{employee}/invitation — sends (or re-sends) the
 * onboarding email.
 *
 * The backend picks the journey from the role: `company_admin`/`scheduler` get a
 * link into this web app's set-password screen, while `employee` receives a
 * "download the app" email and verifies by emailed code on their phone. The
 * resolved channel comes back so the caller can show an accurate toast.
 */
async function sendInvitation({
    employeeId,
    input,
}: {
    employeeId: string;
    input: SendInvitationInput;
}): Promise<SendInvitationResult> {
    const response = await apiClient.post<ApiSuccessResponse<EmployeeInvitationDto>>(
        `/employees/${employeeId}/invitation`,
        {
            role: input.role,
            // Omit rather than send an empty string: the invitee keeps whatever
            // address their account already has.
            email: input.email.trim() === '' ? undefined : input.email.trim(),
        },
    );

    const invitation = response.data.data;

    return {
        channel: invitation.channel === 'web' ? 'web' : 'mobile',
        email: invitation.email,
    };
}

/** GET /api/v1/employees/{employee} — a single mapped employee record. */

async function fetchEmployee(employeeId: string): Promise<Employee> {
    const response = await apiClient.get<ApiSuccessResponse<EmployeeDto>>(
        `/employees/${employeeId}`,
    );

    return mapEmployee(response.data.data);
}

/** Derives aggregate KPI counters from an employee collection. */
export function deriveEmployeeStats(employees: readonly Employee[]): EmployeeStats {
    return employees.reduce<EmployeeStats>(
        (acc, employee) => {
            acc.total += 1;
            if (employee.status === 'active') acc.active += 1;
            if (employee.status === 'pending') acc.pending += 1;
            return acc;
        },
        { total: 0, active: 0, pending: 0 },
    );
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reads the employee directory, optionally scoped to a branch. Returns the
 * standard TanStack Query result so the UI can branch on
 * `isLoading` / `isError` / `data` cleanly, preserving the existing loading
 * skeletons, empty states and error boundaries. Previous data is kept while a
 * new filter loads to avoid a jarring table flash.
 */
export function useEmployees(params: EmployeeListParams = {}): UseQueryResult<Employee[], Error> {
    return useQuery<Employee[], Error>({
        queryKey: EMPLOYEES_KEYS.list(params),
        queryFn: () => fetchEmployees(params),
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
}

/**
 * Reads a single employee for detail screens (e.g. the availability editor's
 * page header). Disabled until the route param resolves.
 */
export function useEmployee(employeeId: string): UseQueryResult<Employee, Error> {
    return useQuery<Employee, Error>({
        queryKey: EMPLOYEES_KEYS.detail(employeeId),
        queryFn: () => fetchEmployee(employeeId),
        enabled: employeeId.length > 0,
        staleTime: 30_000,
    });
}

/**
 * Creates a new employee and invalidates the directory cache on success so the
 * table and KPI counters refresh automatically.
 */
export function useCreateEmployee(): UseMutationResult<Employee, Error, CreateEmployeeInput> {
    const queryClient = useQueryClient();

    return useMutation<Employee, Error, CreateEmployeeInput>({
        mutationFn: createEmployee,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEYS.all });
        },
    });
}

/** Variables accepted by {@link useUpdateEmployee}. */
export interface UpdateEmployeeVariables {
    employeeId: string;
    input: UpdateEmployeeInput;
}

/**
 * Saves profile edits for one employee, then refreshes every cached directory
 * view so the table row, KPI counters and any open detail screen all reflect the
 * change without a manual reload.
 */
export function useUpdateEmployee(): UseMutationResult<Employee, Error, UpdateEmployeeVariables> {
    const queryClient = useQueryClient();

    return useMutation<Employee, Error, UpdateEmployeeVariables>({
        mutationFn: updateEmployee,
        onSuccess: (employee) => {
            queryClient.setQueryData(EMPLOYEES_KEYS.detail(employee.id), employee);
            void queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEYS.all });
        },
    });
}

/** Variables accepted by {@link useSendInvitation}. */
export interface SendInvitationVariables {
    employeeId: string;
    input: SendInvitationInput;
}

/**
 * Sends the onboarding email for one employee.
 *
 * The directory cache is invalidated on success because inviting someone also
 * flips their invitation state (and may create their login), which the row's
 * status column and menu labels read from.
 */
export function useSendInvitation(): UseMutationResult<
    SendInvitationResult,
    Error,
    SendInvitationVariables
> {
    const queryClient = useQueryClient();

    return useMutation<SendInvitationResult, Error, SendInvitationVariables>({
        mutationFn: sendInvitation,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEYS.all });
        },
    });
}

