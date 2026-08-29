<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Add the number of staff required for each shift. */
    public function up(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->unsignedSmallInteger('required_staff')->default(1);
        });
    }

    /** Remove the staffing capacity field on rollback. */
    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->dropColumn('required_staff');
        });
    }
};
