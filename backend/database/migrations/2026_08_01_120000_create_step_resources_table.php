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
        Schema::create('step_resources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plan_step_id')->constrained()->cascadeOnDelete();
            $table->string('url');
            $table->string('title');
            $table->string('source')->nullable();
            $table->text('description')->nullable();
            $table->unsignedTinyInteger('order')->default(0);
            $table->timestamps();
        });

        Schema::table('plan_steps', function (Blueprint $table) {
            $table->timestamp('resources_fetched_at')->nullable()->after('video_published_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('plan_steps', function (Blueprint $table) {
            $table->dropColumn('resources_fetched_at');
        });

        Schema::dropIfExists('step_resources');
    }
};
