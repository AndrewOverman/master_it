<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Client types (src/types/plan.ts) expect bare Plan / Plan[] shapes,
        // not Laravel's default {"data": ...} envelope.
        JsonResource::withoutWrapping();

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

        // Keyed by email+IP so neither a single IP hammering many emails nor
        // a distributed attack hammering one email escapes the limit.
        RateLimiter::for('login', function (Request $request) {
            $key = Str::lower($request->input('email', '')).'|'.$request->ip();

            return Limit::perMinute(5)->by($key);
        });

        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // Each call makes an outbound request to RevenueCat, and the client
        // polls this on a backoff after a purchase. Keyed by user, not IP —
        // the limit protects our RevenueCat quota per account, and several
        // users can legitimately share an IP on the same network.
        RateLimiter::for('subscription-refresh', function (Request $request) {
            return Limit::perMinute(10)->by($request->user()?->id ?: $request->ip());
        });

        // Password::sendResetLink() already throttles re-sends to the same
        // email every 60s on its own — this is the outer guard against one
        // IP working through many different emails, so it's keyed by IP
        // alone rather than email+IP like `login`.
        RateLimiter::for('forgot-password', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // The default notification links to route('password.reset', ...),
        // which doesn't exist here — this is an API-only backend with no
        // web frontend. Point it at the mobile app's deep link instead,
        // the same masterit://... scheme SharedPlan links already use.
        ResetPassword::createUrlUsing(function (object $notifiable, string $token) {
            $scheme = config('services.mobile.scheme');
            $email = urlencode($notifiable->getEmailForPasswordReset());

            return "{$scheme}://reset-password?token={$token}&email={$email}";
        });
    }
}
