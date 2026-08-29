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
        Schema::create('company_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->unique()->constrained('companies')->cascadeOnDelete();
            
            $table->string('timezone')->default('UTC');
            $table->string('date_format')->default('Y-m-d');
            $table->string('time_format')->default('24h');
            
            $table->string('week_start_day')->default('Monday');
            $table->integer('default_shift_duration')->default(480)->comment('In minutes');
            $table->integer('default_break_minutes')->default(30)->comment('In minutes');
            
            $table->string('currency', 3)->default('AUD');
            $table->string('language', 10)->default('en');
            
            $table->boolean('allow_shift_swap')->default(true);
            $table->boolean('allow_employee_availability')->default(true);
            $table->boolean('allow_leave_requests')->default(true);
            $table->boolean('allow_push_notifications')->default(true);
            
            $table->string('logo')->nullable();
            $table->string('primary_color', 7)->nullable()->default('#4F46E5');
            $table->string('secondary_color', 7)->nullable()->default('#06B6D4');
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('company_settings');
    }
};
