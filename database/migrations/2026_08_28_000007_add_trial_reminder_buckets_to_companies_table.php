<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Track which configurable trial-ending reminder buckets have already been
     * sent for a company (e.g. [7, 3, 1] = the "7 days / 3 days / 1 day"
     * reminders). The legacy `trial_ending_reminded_at` timestamp is retained
     * for backwards compatibility, but the JSON array is the authoritative
     * "no duplicate reminder per bucket" guard.
     */
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->json('trial_reminders_sent')->nullable()->after('trial_ending_reminded_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn('trial_reminders_sent');
        });
    }
};
