<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Maps each plan to the features it enables. Configuration is stored as
     * JSON so per-plan limits and options can evolve without new columns.
     */
    public function up(): void
    {
        Schema::create('plan_features', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plan_id')->constrained('plans')->cascadeOnDelete();
            $table->foreignId('feature_id')->constrained('features')->cascadeOnDelete();
            $table->boolean('is_enabled')->default(true);
            $table->integer('limit_value')->nullable()->comment('Numeric limit for the feature, if any');
            $table->jsonb('configuration')->nullable()->comment('Arbitrary per-plan feature configuration');
            $table->timestamps();

            $table->unique(['plan_id', 'feature_id']);
            $table->index('feature_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('plan_features');
    }
};
