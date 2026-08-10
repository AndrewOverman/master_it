<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\Request;

/**
 * The web page a verification link lands on.
 *
 * Unauthenticated on purpose, unlike Laravel's stock verification
 * controller: this link is opened from a mail client, usually in a browser
 * that has never had a session with this API (there is no web login here at
 * all — see bootstrap/app.php). The signature is what proves the link came
 * from us and hasn't expired; the `hash` proves the address hasn't changed
 * since the mail was sent.
 *
 * Follows SharedPlanRedirectController in passing only derived scalars to
 * the view, never the model.
 */
class EmailVerificationController extends Controller
{
    public function verify(Request $request, string $id, string $hash)
    {
        // Checked here rather than with the `signed` middleware so an expired
        // link — the single most likely way to arrive here, since these are
        // only valid for 60 minutes — gets the branded "request a new one"
        // page instead of the framework's bare 403.
        if (! $request->hasValidSignature()) {
            return $this->view(verified: false, status: 403);
        }

        $user = User::find($id);

        if (! $user || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return $this->view(verified: false, status: 403);
        }

        // Already-verified is a success, not an error — people re-tap links,
        // and mail clients pre-fetch them. Only the first pass fires the event.
        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        return $this->view(verified: true);
    }

    private function view(bool $verified, int $status = 200)
    {
        return response()->view('email-verified', [
            'verified' => $verified,
            'deepLink' => config('services.mobile.scheme').'://email-verified',
            'appStoreUrl' => config('services.mobile.app_store_url'),
        ], $status);
    }
}
