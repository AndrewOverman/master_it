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
        Schema::table('users', function (Blueprint $table) {
            // Generations used within the current period. Copying a
            // featured/shared plan never touches this — only Plan::store()
            // (AI generation) does.
            $table->unsignedInteger('plans_generated_count')->default(0)->after('subscription_expires_at');

            // When the current monthly window started. A read that finds
            // now() >= this + 1 month resets the count lazily rather than
            // relying on a scheduled job.
            $table->timestamp('generation_period_started_at')->nullable()->after('plans_generated_count');

            // Set the first (and only) time a free-tier account uses its
            // lifetime generation. Account-level, so it doesn't stop the
            // same person registering again — see User::canGenerate().
            $table->timestamp('free_generation_claimed_at')->nullable()->after('generation_period_started_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'plans_generated_count',
                'generation_period_started_at',
                'free_generation_claimed_at',
            ]);
        });
    }
};
