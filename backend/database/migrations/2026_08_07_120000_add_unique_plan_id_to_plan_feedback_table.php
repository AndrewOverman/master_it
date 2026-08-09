<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A plan now keeps exactly one review — its latest. Completing a plan is
     * repeatable (steps can be unchecked and re-checked), so the completion
     * prompt can come round again, and PlanController::feedback() upserts
     * rather than appends. This backs that with a real constraint so a
     * double-submit can't slip a second row past it.
     */
    public function up(): void
    {
        // Collapse any pre-existing history down to the newest row per plan,
        // otherwise the index below can't be created.
        DB::statement(
            'DELETE FROM plan_feedback WHERE id NOT IN (SELECT MAX(id) FROM plan_feedback GROUP BY plan_id)'
        );

        Schema::table('plan_feedback', function (Blueprint $table) {
            $table->unique('plan_id');
        });
    }

    public function down(): void
    {
        Schema::table('plan_feedback', function (Blueprint $table) {
            $table->dropUnique(['plan_id']);
        });
    }
};
