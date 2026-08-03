<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // SQLite (used for local/CI tests) has no ALTER COLUMN syntax at
        // all; Schema::change() rebuilds the table instead, which is fine
        // here since there's no real data in a fresh test database.
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('plans', function (Blueprint $table) {
                $table->foreignId('user_id')->nullable()->change();
            });

            return;
        }

        // Plain ALTER COLUMN rather than Blueprint::change() so this only
        // touches the NOT NULL constraint and leaves the foreign key
        // (and its cascadeOnDelete) untouched. Lets a plan exist without
        // an owner, e.g. admin-curated featured plans seeded directly.
        DB::statement('ALTER TABLE plans ALTER COLUMN user_id DROP NOT NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('plans', function (Blueprint $table) {
                $table->foreignId('user_id')->nullable(false)->change();
            });

            return;
        }

        DB::statement('ALTER TABLE plans ALTER COLUMN user_id SET NOT NULL');
    }
};
