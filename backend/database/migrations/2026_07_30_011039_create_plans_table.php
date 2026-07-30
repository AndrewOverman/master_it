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
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('original_prompt');
            $table->enum('status', ['generating', 'ready', 'failed'])->default('generating');
            $table->text('error_message')->nullable();
            $table->enum('skill_level', ['beginner', 'intermediate', 'advanced'])->nullable();
            $table->enum('time_commitment', ['light', 'moderate', 'intensive'])->nullable();
            $table->unsignedInteger('target_days')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
