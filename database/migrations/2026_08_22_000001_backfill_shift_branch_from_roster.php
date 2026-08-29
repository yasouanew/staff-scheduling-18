<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Repairs shifts whose `branch_id` was never populated.
 *
 * `ShiftService` previously persisted only the payload it was handed, and the
 * calendar submits a `roster_id` without a `branch_id` (a shift belongs to a
 * branch *through* its roster). Those shifts therefore saved with a null branch
 * and every one of them collapsed into a single "Unassigned branch" group in the
 * roster calendar, regardless of which branch they were actually rostered to.
 *
 * The service now derives the branch on write; this backfills the rows created
 * before that fix so historical data groups correctly too.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The roster is the source of truth for a shift's branch and company.
        // Correlated sub-selects are used rather than a joined UPDATE so the
        // statement runs unchanged on PostgreSQL, MySQL, and SQLite.
        foreach (['branch_id', 'company_id'] as $column) {
            DB::table('shifts')
                ->whereNull($column)
                ->whereNotNull('roster_id')
                ->whereRaw(
                    "exists (select 1 from rosters where rosters.id = shifts.roster_id and rosters.{$column} is not null)"
                )
                ->update([
                    $column => DB::raw(
                        "(select rosters.{$column} from rosters where rosters.id = shifts.roster_id)"
                    ),
                ]);
        }
    }


    public function down(): void
    {
        // Intentionally irreversible: the previous state was missing data, and
        // nulling these columns again would only reintroduce the grouping bug.
    }
};
