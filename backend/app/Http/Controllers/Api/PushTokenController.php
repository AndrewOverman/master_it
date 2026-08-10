<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushToken;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PushTokenController extends Controller
{
    /**
     * Registers (or re-registers) the calling device.
     *
     * Keyed on the token rather than on user+token, so a phone that changes
     * hands moves with it: whoever is signed in now owns the registration,
     * and the previous account stops receiving pushes on a device it no
     * longer has. Re-registering is the app's normal behaviour on every
     * launch, which is also what keeps `timezone` current for someone who
     * travels.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'max:255'],
            'platform' => ['required', Rule::in(['ios', 'android'])],
            // Laravel's `timezone` rule checks against the real IANA
            // database, so a junk value can't quietly poison the scheduler's
            // hour arithmetic for this user.
            'timezone' => ['sometimes', 'required', 'timezone'],
        ]);

        PushToken::updateOrCreate(
            ['token' => $validated['token']],
            [
                'user_id' => $request->user()->id,
                'platform' => $validated['platform'],
                'timezone' => $validated['timezone'] ?? 'UTC',
                'last_seen_at' => now(),
            ]
        );

        return response()->noContent();
    }

    /**
     * Unregisters a device, called on sign-out.
     *
     * Scoped to the caller's own tokens: an Expo token isn't a secret the
     * way a session token is, so without the ownership check anyone holding
     * one could silence somebody else's notifications.
     */
    public function destroy(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
        ]);

        PushToken::where('token', $validated['token'])
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->noContent();
    }
}
