<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Roster\CopyPreviousWeekRequest;
use App\Http\Requests\Roster\StoreRosterRequest;
use App\Http\Requests\Roster\UpdateRosterRequest;
use App\Http\Resources\RosterResource;
use App\Models\Roster;
use App\Services\RosterChangeService;
use App\Services\RosterConflictService;
use App\Services\RosterService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RosterController extends Controller
{
    use ApiResponse;

    public function __construct(
        private RosterService $rosterService,
        private RosterConflictService $conflictService,
        private RosterChangeService $changeService,
    ) {}

    /**
     * Display a paginated listing of rosters.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Roster::class);

        $filters = $request->only(['status', 'company_id', 'branch_id', 'week_start', 'week_end', 'per_page']);

        // Non super admins can only see their own company's rosters.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $rosters = $this->rosterService->paginate($filters);

        return $this->successResponse(
            RosterResource::collection($rosters)->response()->getData(true),
            'Rosters retrieved successfully.'
        );
    }

    /**
     * Store a newly created roster.
     */
    public function store(StoreRosterRequest $request): JsonResponse
    {
        $this->authorize('create', Roster::class);

        $data = $request->validated();

        // Non super admins can only create rosters for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $roster = $this->rosterService->create($data);

        return $this->successResponse(
            new RosterResource($roster->load(['company', 'branch'])),
            'Roster created successfully.',
            201
        );
    }

    /**
     * Create a roster by copying shifts from a previous week.
     */
    public function copyPreviousWeek(CopyPreviousWeekRequest $request): JsonResponse
    {
        $this->authorize('create', Roster::class);

        $data = $request->validated();

        // Non super admins can only create rosters for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $roster = $this->rosterService->copyPreviousWeek($data);

        return $this->successResponse(
            new RosterResource($roster),
            'Roster created from previous week successfully.',
            201
        );
    }

    /**
     * Display the specified roster.
     */
    public function show(Roster $roster): JsonResponse
    {
        $this->authorize('view', $roster);

        // Eager-load everything the weekly matrix grid needs: the employee (row
        // grouping + avatar), the position (colour accent) and the department /
        // branch used to group rows.
        $roster->load([
            'company',
            'branch',
            'publisher',
            'shifts.employee.department',
            'shifts.employee.branch',
            'shifts.position',
            'shifts.department',
        ]);

        // Derive the transient overtime / leave / double-booking flags that the
        // grid renders as conflict overlays.
        $this->conflictService->annotate($roster);

        return $this->successResponse(
            new RosterResource($roster),
            'Roster retrieved successfully.'
        );
    }

    /**
     * Update the specified roster.
     */
    public function update(UpdateRosterRequest $request, Roster $roster): JsonResponse
    {
        $this->authorize('update', $roster);

        $roster = $this->rosterService->update($roster, $request->validated());

        return $this->successResponse(
            new RosterResource($roster->load(['company', 'branch'])),
            'Roster updated successfully.'
        );
    }

    /**
     * Publish the roster, making it visible to employees.
     *
     * Validates the roster is a draft, marks it published (with timestamp and
     * publisher), records the event in the change history and notifies every
     * employee who has shifts on it (grouped, idempotent).
     */
    public function publish(Request $request, Roster $roster): JsonResponse
    {
        $this->authorize('publish', $roster);

        abort_if($roster->isPublished(), 422, 'This roster is already published.');

        $roster = $this->changeService->publish($roster, $request->user());

        return $this->successResponse(
            new RosterResource($roster->load(['company', 'branch', 'publisher'])),
            'Roster published successfully.'
        );
    }

    /**
     * Remove the specified roster.
     */
    public function destroy(Roster $roster): JsonResponse
    {
        $this->authorize('delete', $roster);

        $this->rosterService->delete($roster);

        return $this->successResponse(null, 'Roster deleted successfully.');
    }
}
