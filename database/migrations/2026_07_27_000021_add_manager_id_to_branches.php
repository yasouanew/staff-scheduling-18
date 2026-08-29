<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The branches table (000004) is created before the employees table
     * (000007), so the manager foreign key — which references an employee — is
     * added here once the employees table is available. Mirrors the deferred
     * foreign-key convention used by add_user_foreign_keys.
     */
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->foreignId('manager_id')
                ->nullable()
                ->after('name')
                ->constrained('employees')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropForeign(['manager_id']);
            $table->dropColumn('manager_id');
        });
    }
};
