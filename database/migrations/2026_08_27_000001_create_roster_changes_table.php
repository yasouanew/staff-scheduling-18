<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Purpose-built change/audit history for published rosters.
     *
     * Every post-publication mutation on a roster writes one row here. Rows are
     * grouped (by employee) for notifications but kept individually here so the
     * full, unambiguous history is always available. `old_data`/`new_data` are
     * JSONB snapshots of the affected shift before/after the change.
     */
    public function up(): void
    {
        Schema::create('roster_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('roster_id')
                ->constrained('rosters')
                ->cascadeOnDelete();
            $table->foreignId('shift_id')
                ->nullable()
                ->constrained('shifts')
                ->nullOnDelete();
            $table->foreignId('employee_id')
                ->nullable()
                ->constrained('employees')
                ->nullOnDelete();
            $table->string('action');
            $table->jsonb('old_data')->nullable();
            $table->jsonb('new_data')->nullable();
            $table->foreignId('performed_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamps();

            $table->index(['roster_id', 'employee_id']);
            $table->index(['roster_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roster_changes');
    }
};
