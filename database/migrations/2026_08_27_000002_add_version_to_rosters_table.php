<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optimistic-lock version for the roster.
     *
     * Incremented on every successful publish and on every post-publication
     * change apply. Clients echo the version they last saw; a mismatch on
     * write returns 409 so stale editors cannot silently overwrite each other.
     */
    public function up(): void
    {
        Schema::table('rosters', function (Blueprint $table) {
            $table->unsignedBigInteger('version')->default(1)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('rosters', function (Blueprint $table) {
            $table->dropColumn('version');
        });
    }
};
