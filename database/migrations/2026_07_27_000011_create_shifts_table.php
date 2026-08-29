<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->foreignId('roster_id')->constrained('rosters')->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('position_id')->nullable()->constrained('positions')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            
            $table->date('date');
            $table->time('start_time');
            $table->time('end_time');
            $table->integer('break_minutes')->default(30);
            $table->boolean('paid_break')->default(false);
            
            $table->string('status')->default('scheduled')->comment('scheduled, completed, cancelled, swap_requested');
            $table->text('notes')->nullable();
            
            $table->timestamps();

            // Index for calendar queries & roster building
            $table->index(['roster_id', 'employee_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
