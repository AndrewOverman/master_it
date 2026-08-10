<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Replaces the framework's `verified` middleware (aliased in
 * bootstrap/app.php).
 *
 * The stock one abort(403)s with only a sentence, leaving the app to match
 * on an English string to tell "verify your email" apart from every other
 * 403. This returns a stable machine-readable `code` alongside the sentence,
 * the same instinct as UserResource's generation_limit_message: the client
 * branches on the code, and shows the message verbatim so the API and the UI
 * can't drift.
 */
class EnsureEmailIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof MustVerifyEmail && ! $user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Verify your email address to generate a plan. Check your inbox for the link.',
                'code' => 'email_unverified',
            ], 403);
        }

        return $next($request);
    }
}
