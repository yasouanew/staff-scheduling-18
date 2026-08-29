<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a branch's trading hours and break policy.
 *
 * The columns are deliberately split into a *default* and a set of per-weekday
 * *overrides*:
 *
 * - The defaults (`default_opens_at`, `default_closes_at`,
 *   `default_break_minutes`, `default_break_paid`) describe the ordinary day and
 *   are what a roster should assume for any date nobody has customised.
 * - `day_schedules` holds only the exceptions, keyed by weekday. Storing the
 *   whole week as seven rows would force every branch to restate the same times
 *   seven times, and would make "the standard day changed" an update of seven
 *   records instead of one.
 *
 * Every column is nullable so existing branches remain valid: an unset schedule
 * means "not specified yet", which is different from "open zero hours".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->time('default_opens_at')->nullable()->after('timezone');
            $table->time('default_closes_at')->nullable()->after('default_opens_at');

            // Minutes rather than a time span: breaks are reasoned about as a
            // duration ("30 minutes unpaid"), and payroll needs to subtract them.
            $table->unsignedSmallInteger('default_break_minutes')->nullable()->after('default_closes_at');
            $table->boolean('default_break_paid')->default(false)->after('default_break_minutes');

            $table->json('day_schedules')->nullable()->after('default_break_paid');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn([
                'default_opens_at',
                'default_closes_at',
                'default_break_minutes',
                'default_break_paid',
                'day_schedules',
            ]);
        });
    }
};
