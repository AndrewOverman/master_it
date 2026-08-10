<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail as BaseVerifyEmail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * The framework's verification notification, queued.
 *
 * Sending goes over HTTP to Resend, so leaving this synchronous would put a
 * third-party round-trip (and its failure modes) directly in the path of
 * POST /register. Requires a running queue worker — the same one the
 * GeneratePlanSteps job already depends on.
 *
 * Unlike ResetPassword (see AppServiceProvider::boot), the URL is left
 * alone: the parent's temporarySignedRoute('verification.verify', ...) is
 * exactly right now that routes/web.php defines that route. Verification
 * links deliberately open a web page rather than deep-linking into the app,
 * because email is so often read on a desktop where masterit:// does nothing.
 */
class VerifyEmail extends BaseVerifyEmail implements ShouldQueue
{
    use Queueable;
}
