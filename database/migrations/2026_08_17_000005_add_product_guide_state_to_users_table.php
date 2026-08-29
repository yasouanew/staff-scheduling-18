<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('web_welcome_completed_at')->nullable()->after('last_login_at');
            $table->json('web_feature_tips')->nullable()->after('web_welcome_completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['web_welcome_completed_at', 'web_feature_tips']);
        });
    }
};
