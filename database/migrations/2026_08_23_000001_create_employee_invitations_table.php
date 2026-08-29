<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the invitation ledger that backs "Send invite" from the team page.
     *
     * One row per outstanding invitation. The delivery `channel` is derived from
     * the invited role: browser roles (company_admin / scheduler) receive a
     * tokenised link into the web app's set-password screen, whereas employees
     * receive a link that guides them to download the mobile app and then
     * verify with a one-time code.
     */
    public function up(): void
    {
        Schema::create('employee_invitations', function (Blueprint $table) {
            $table->id();

            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();

            // Denormalised so an invitation can be resolved before login exists.
            $table->string('email')->index();
            $table->string('role')->comment('company_admin, scheduler, employee');
            $table->string('channel')->comment('web, mobile');

            // Web channel: hashed single-use token embedded in the emailed link.
            $table->string('token_hash', 64)->nullable()->index();
            $table->timestamp('expires_at')->nullable();

            // Mobile channel: hashed one-time code the app asks the user to enter.
            $table->string('code_hash', 64)->nullable();
            $table->timestamp('code_expires_at')->nullable();
            $table->unsignedTinyInteger('code_attempts')->default(0);

            // Mobile channel: short-lived proof that the code was verified, so the
            // "set your password" step cannot be called by simply knowing an email.
            $table->string('setup_token_hash', 64)->nullable();
            $table->timestamp('setup_token_expires_at')->nullable();

            $table->unsignedSmallInteger('send_count')->default(0);
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamp('accepted_at')->nullable();

            $table->timestamps();

            // A user only ever has one live invitation.
            $table->unique('user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('employee_invitations');
    }
};
