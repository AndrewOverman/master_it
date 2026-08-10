<?php

use App\Http\Middleware\EnsureEmailIsVerified;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // This is an API-only backend with no "login" web route. The default
        // guest-redirect callback calls route('login') unconditionally for
        // non-JSON requests, which throws RouteNotFoundException (a 500)
        // before auth:sanctum ever gets to return a clean 401. Never redirect.
        $middleware->redirectGuestsTo(fn () => null);

        $middleware->throttleApi();

        // Same name, JSON body with a `code` the client can branch on —
        // see App\Http\Middleware\EnsureEmailIsVerified.
        $middleware->alias([
            'verified' => EnsureEmailIsVerified::class,
        ]);

        // Railway (and most PaaS hosts) terminate TLS at a reverse proxy in
        // front of the app, so trust the forwarded headers it sets — without
        // this, Request::secure() and absolute URL generation are wrong in
        // staging/production.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Reports to Sentry when SENTRY_LARAVEL_DSN is set, and does nothing
        // when it isn't — local and CI runs stay offline. This is the only
        // place server-side failures become visible without opening Railway's
        // log viewer: a generation job throwing, the queue worker dying, a
        // webhook 500ing. All of those are currently silent.
        Integration::handles($exceptions);

        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })->create();
