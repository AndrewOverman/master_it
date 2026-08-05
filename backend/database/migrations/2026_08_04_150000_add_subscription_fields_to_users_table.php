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
            // 'free' | 'starter' | 'pro' — the generation limit for each
            // tier lives in config('subscriptions'), not here, so pricing
            // can change without a migration.
            $table->string('subscription_tier')->default('free')->after('password');

            // Null until the user has ever subscribed. Otherwise one of
            // 'active' | 'trialing' | 'canceled' | 'past_due' | 'expired'
            // (mirrors RevenueCat's entitlement lifecycle).
            $table->string('subscription_status')->nullable()->after('subscription_tier');

            // Which store the active subscription was purchased through —
            // 'ios' | 'android'. Useful for support/refund lookups.
            $table->string('subscription_platform')->nullable()->after('subscription_status');

            // RevenueCat's app_user_id for this user, so incoming webhooks
            // can be matched back to a row without guessing at identity.
            $table->string('revenuecat_app_user_id')->nullable()->unique()->after('subscription_platform');

            // From RevenueCat's entitlement payload. Source of truth for
            // "is the subscription currently active" even if a webhook is
            // delayed or missed — check this instead of trusting
            // subscription_status alone to never go stale.
            $table->timestamp('subscription_expires_at')->nullable()->after('revenuecat_app_user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'subscription_tier',
                'subscription_status',
                'subscription_platform',
                'revenuecat_app_user_id',
                'subscription_expires_at',
            ]);
        });
    }
};
