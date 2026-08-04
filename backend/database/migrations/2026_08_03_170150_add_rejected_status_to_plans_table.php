<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const OLD_STATUSES = ['generating', 'ready', 'failed'];

    private const NEW_STATUSES = ['generating', 'ready', 'failed', 'rejected'];

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
                $table->enum('status', self::NEW_STATUSES)->default('generating')->change();
                $table->string('rejection_category')->nullable()->after('error_message');
            });

            return;
        }

        // enum() on Postgres is just a varchar with an unnamed check
        // constraint (Postgres auto-names it "plans_status_check"), so
        // widening it means dropping and re-adding that constraint rather
        // than a plain ALTER COLUMN.
        DB::statement('ALTER TABLE plans DROP CONSTRAINT plans_status_check');
        DB::statement("ALTER TABLE plans ADD CONSTRAINT plans_status_check CHECK (status IN ('".implode("','", self::NEW_STATUSES)."'))");

        Schema::table('plans', function (Blueprint $table) {
            $table->string('rejection_category')->nullable()->after('error_message');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('plans', function (Blueprint $table) {
                $table->dropColumn('rejection_category');
            });

            Schema::table('plans', function (Blueprint $table) {
                $table->enum('status', self::OLD_STATUSES)->default('generating')->change();
            });

            return;
        }

        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('rejection_category');
        });

        DB::statement('ALTER TABLE plans DROP CONSTRAINT plans_status_check');
        DB::statement("ALTER TABLE plans ADD CONSTRAINT plans_status_check CHECK (status IN ('".implode("','", self::OLD_STATUSES)."'))");
    }
};
