<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
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
        DB::statement('ALTER TABLE plans ALTER COLUMN user_id SET NOT NULL');
    }
};
