<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Every table Laravel owns in the public schema. Supabase exposes the
     * whole public schema through its auto-generated PostgREST Data API
     * (reachable with the project's anon key, entirely outside this app),
     * so this list is deliberately "all of them," not just the
     * user-data-looking ones — cache/jobs/sessions payloads can carry
     * data just as sensitive as the domain tables.
     *
     * New tables don't inherit RLS retroactively — enable it directly in
     * the migration that creates them instead of adding it here. This
     * list is a one-time backfill for tables that predate that rule
     * (`plan_refinements` enables it itself, in its own create-table
     * migration).
     */
    private const TABLES = [
        'users',
        'password_reset_tokens',
        'sessions',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs',
        'personal_access_tokens',
        'plans',
        'plan_steps',
        'step_resources',
        'migrations',
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // No CREATE POLICY calls on purpose. This app's only legitimate
        // path to this database is Laravel's own connection, which
        // authenticates as the Supabase project's postgres.<ref> owner
        // role via the session pooler — table owners bypass RLS
        // unconditionally, with or without policies, so this is a no-op
        // for Laravel. What it does do is make every table default-deny
        // for the anon/authenticated roles the Data API uses, closing
        // off direct access to anyone holding the project's anon key.
        //
        // Deliberately NOT using FORCE ROW LEVEL SECURITY: that extends
        // RLS to the table owner too. If Laravel's role ever turns out
        // not to carry BYPASSRLS the way we expect, FORCE would lock the
        // app itself out with a zero-policy table — total outage, for no
        // security benefit, since Laravel is the trusted access path we
        // have no reason to restrict from itself.
        foreach (self::TABLES as $table) {
            DB::statement('ALTER TABLE "'.$table.'" ENABLE ROW LEVEL SECURITY');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach (self::TABLES as $table) {
            DB::statement('ALTER TABLE "'.$table.'" DISABLE ROW LEVEL SECURITY');
        }
    }
};
