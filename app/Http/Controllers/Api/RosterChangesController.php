<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Roster\ApplyRosterChangesRequest;
use App\Http\Resources\RosterChangeResource;
use App\Http\Resources\RosterResource;
use App\Models\Roster;
use App\Services\RosterChangeService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Preview, apply and browse post-publication roster changes.
 *
 * `preview()` and `apply()` both use the roster's optimistic-lock `version`:
 * the UI previews against the version it currently shows, and the apply only
 * succeeds if that version is still current (otherwise 409, prompting the
 * manager to refresh).
 */
class RosterChangesController extends Controller
{
    use ApiResponse;

    public function __construct(private RosterChangeService $changeService) {}

    /**
     * Preview the affected-employee summary for a set of mutations (no writes).
     */
    public function preview(Request $request, Roster $roster): JsonResponse
    {
        $this->authorize('update', $roster);

        abort_if(! $roster->isPublished(), 422, 'Only published rosters can be changed with notifications.');

        $request->validate([
            'mutations' => ['required', 'array', 'min:1'],
            'mutations.*.type' => ['required', 'string', 'in:add,update,cancel,reassign'],
        ]);

        try {
            $result = $this->changeService->preview($roster, $request->input('mutations'));
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 409);
        }

        return $this->successResponse($result, 'Change preview generated successfully.');
    }

    /**
     * Apply mutations to a published roster, recording changes and notifying
     * affected employees (grouped).
     */
    public function apply(ApplyRosterChangesRequest $request, Roster $roster): JsonResponse
    {
        $this->authorize('update', $roster);

        abort_if(! $roster->isPublished(), 422, 'Only published rosters can be changed with notifications.');

        try {
            $result = $this->changeService->apply(
                $roster,
                $request->validated()['mutations'],
                $request->user(),
                (int) $request->validated()['version'],
            );
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 409);
        }

        return $this->successResponse($result, 'Roster changes applied and employees notified successfully.');
    }

    /**
     * Browse the change/audit history for a roster.
     */
    public function index(Request $request, Roster $roster): JsonResponse
    {
        $this->authorize('view', $roster);

        $perPage = (int) $request->query('per_page', 25);
        $changes = $this->changeService->history($roster, $perPage);

        return $this->successResponse(
            RosterChangeResource::collection($changes)->response()->getData(true),
            'Roster changes retrieved successfully.'
        );
    }

    /**
     * Reload a roster (returns the latest version + shifts) so a stale editor
     * can refresh before retrying an apply.
     */
    public function latest(Roster $roster): JsonResponse
    {
        $this->authorize('view', $roster);

        $roster->load([
            'company',
            'branch',
            'publisher',
            'shifts.employee.department',
            'shifts.employee.branch',
            'shifts.position',
            'shifts.department',
        ]);

        return $this->successResponse(
            new RosterResource($roster),
            'Roster retrieved successfully.'
        );
    }
}
