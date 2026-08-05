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
        // max_plans was a single cap shared across generating AND copying
        // plans. It's superseded by plans_generated_count (generation-only,
        // tier-aware) — copying is now unlimited for everyone.
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('max_plans');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('max_plans')->default(3)->after('password');
        });
    }
};
