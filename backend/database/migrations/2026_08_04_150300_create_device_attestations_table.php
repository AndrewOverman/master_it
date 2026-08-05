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

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_attestations');
    }
};
