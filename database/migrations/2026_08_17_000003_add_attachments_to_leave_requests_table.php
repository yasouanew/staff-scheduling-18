<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Add the multi-file attachment list used by leave request submissions. */
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->json('attachments')->nullable();
        });
    }

    /** Remove the multi-file attachment list on rollback. */
    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn('attachments');
        });
    }
};
