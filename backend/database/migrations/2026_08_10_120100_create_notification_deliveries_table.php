<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The ledger of everything actually sent to a user, which is what makes
 * two separate guarantees enforceable rather than best-effort:
 *
 *  - "once only" — a plan can only ever announce itself halfway once, no
 *    matter how many times the scheduler evaluates it.
 *  - "at most one notification a day" — the budget that keeps a nudging
 *    app from becoming a nagging one.
 *
 * Both are reads against this table, so neither depends on in-memory state
 * that a second scheduler run (or a second worker) wouldn't see.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // The NotificationType backed-enum value, e.g. 'plan_ready'.
            $table->string('type');

            // What makes this send unique within its type, e.g.
            // 'plan:42' for a plan announcing itself ready. Null for types
            // that are allowed to repeat (the daily nudge, which should
            // fire again tomorrow).
            //
            // Null is deliberate rather than an empty string: NULLs compare
            // as distinct in a unique index on both Postgres and SQLite, so
            // repeatable types simply insert new rows while once-only types
            // collide — one index expressing both rules.
            $table->string('dedupe_key')->nullable();

            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['user_id', 'type', 'dedupe_key']);

            // The daily-budget lookup: "has anything at all gone out to
            // this user since their local midnight?"
            $table->index(['user_id', 'sent_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notification_deliveries');
    }
};
