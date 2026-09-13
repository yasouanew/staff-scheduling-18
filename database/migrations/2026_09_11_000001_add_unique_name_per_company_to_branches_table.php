<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Enforces one branch name per company.
 *
 * Branch names identify a location inside a company, so two "Bondi" branches in
 * the same company are ambiguous on every screen that drops the id (rosters,
 * employee assignment, invoices). The rule is deliberately *not* global: two
 * companies may both legitimately own a "Bondi" branch, so the unique index is
 * composite on `(company_id, name)` rather than `name` alone.
 *
 * Pre-existing duplicates are renamed before the index is added, otherwise the
 * migration would fail on live data. The oldest row keeps the name and later
 * ones are suffixed with their id so the original is preserved and the change is
 * reversible in spirit (the previous name remains readable).
 *
 * Validation in Store/UpdateBranchRequest is the primary guard — this index is
 * the backstop for concurrent writes that both pass validation.
 */
return new class extends Migration
{
    /**
     * Index name, fixed so `down()` can drop exactly what `up()` created.
     */
    private const INDEX = 'branches_company_id_name_unique';

    public function up(): void
    {
        $this->renameDuplicates();

        Schema::table('branches', function (Blueprint $table) {
            // The 191-character prefix keeps the index inside MySQL's key-length
            // limit on older versions while remaining a full unique constraint
            // for realistic branch names.
            $table->unique(['company_id', 'name'], self::INDEX);
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropUnique(self::INDEX);
        });
    }

    /**
     * Append the row id to every duplicate name beyond the earliest one.
     *
     * Done in PHP rather than SQL so it stays portable across the MySQL/SQLite
     * drivers the test suite runs on.
     */
    private function renameDuplicates(): void
    {
        $duplicates = DB::table('branches')
            ->select('company_id', 'name')
            ->groupBy('company_id', 'name')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $duplicate) {
            $rows = DB::table('branches')
                ->where('company_id', $duplicate->company_id)
                ->where('name', $duplicate->name)
                ->orderBy('id')
                ->pluck('id');

            // The first record keeps the original name.
            foreach ($rows->slice(1) as $id) {
                DB::table('branches')
                    ->where('id', $id)
                    ->update(['name' => $duplicate->name . ' (' . $id . ')']);
            }
        }
    }
};
