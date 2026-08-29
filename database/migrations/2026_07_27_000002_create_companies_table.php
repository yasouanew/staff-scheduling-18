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
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('abn')->nullable()->comment('Australian Business Number / Tax ID');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('logo')->nullable();
            $table->string('timezone')->default('UTC');
            $table->string('country')->nullable();
            $table->string('state')->nullable();
            $table->string('business_type')->nullable()->comment('e.g. hospitality, retail, healthcare, etc.');
            $table->string('status')->default('active')->comment('active, inactive, suspended');
            $table->unsignedBigInteger('subscription_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
