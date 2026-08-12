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
        // device_attestations was created for a hardware-attestation check
        // (App Attest / Play Integrity) guarding the free tier's one-time
        // generation. That check was never built: nothing ever wrote to the
        // table, and the only code that referenced it was an unused Eloquent
        // model and relation.
        //
        // The free generation is still guarded, by users.free_generation_
        // claimed_at alone (see User::canGenerate()). That's account-level
        // rather than device-level, so it doesn't stop someone registering
        // repeatedly — a deliberate trade rather than an oversight. If
        // per-device attestation is wanted later, it should be designed
        // against whatever the attestation APIs look like then, not resumed
        // from this empty table.
        Schema::dropIfExists('device_attestations');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::create('device_attestations', function (Blueprint $table) {
            $table->id();

            // The App Attest key ID (iOS) or the hashed Play Integrity
            // device signal (Android) — a hardware-backed identifier, not
            // a spoofable client-supplied device ID.
            $table->string('key_id')->unique();

            $table->string('platform'); // 'ios' | 'android'

            $table->boolean('claimed_free_generation')->default(false);

            // Which account claimed the free generation on this device.
            // Nullable: a device can be verified before any account claims
            // the free generation, and a user can be deleted independently.
            $table->foreignId('claimed_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('first_seen_at');
            $table->timestamp('last_verified_at');

            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE "device_attestations" ENABLE ROW LEVEL SECURITY');
        }
    }
};
