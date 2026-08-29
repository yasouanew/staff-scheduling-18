<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A `branch_subscriptions` row links a specific active branch to the
     * company's subscription and records the seat capacity allocated to that
     * branch. It is the "Business subscription → specific active branches"
     * link. Company (tenant) scoping is enforced via `company_id` plus a
     * model-level guard that rejects rows whose branch/subscription belong to
     * a different company.
     *
     * `employee_capacity` is nullable so a branch falls back to the plan's
     * `max_employees` when no per-branch override is set; supported capacities
     * (10/25/50/100) live in data, never in code.
     */
    public function up(): void
    {
        Schema::create('branch_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('subscription_id')->constrained('subscriptions')->cascadeOnDelete();
            $table->string('status')->default('active')
                ->comment('trialing, active, past_due, paused, cancelled, expired');
            $table->integer('employee_capacity')->nullable()
                ->comment('Seat capacity allocated to this branch; null falls back to the plan max_employees');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();

            // Tenant-scoped lookups.
            $table->index('company_id');
            $table->index('subscription_id');
            $table->index(['branch_id', 'status']);

            // A branch can only be subscribed once per subscription.
            $table->unique(['branch_id', 'subscription_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('branch_subscriptions');
    }
};
