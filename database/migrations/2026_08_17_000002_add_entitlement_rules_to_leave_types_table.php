<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Add annual leave entitlement and rollover policy fields. */
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->decimal('allowance_days', 5, 1)->nullable();
            $table->boolean('allows_rollover')->default(false);
            $table->decimal('max_rollover_days', 5, 1)->nullable();
        });
    }

    /** Remove the added leave entitlement and rollover policy fields. */
    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->dropColumn(['allowance_days', 'allows_rollover', 'max_rollover_days']);
        });
    }
};
