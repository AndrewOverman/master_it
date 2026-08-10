<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function show(Request $request)
    {
        return new UserResource($request->user());
    }

    public function update(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'current_password' => ['required_with:password', 'string'],
            'password' => ['sometimes', 'required', 'string', Password::min(8)->mixedCase()->numbers()],

            // Notification settings ride on this endpoint rather than one of
            // their own: they're user-owned profile state, and the client
            // already writes this response straight back into its shared
            // user cache, so a separate endpoint would need its own cache
            // plumbing to achieve nothing extra.
            'notify_plan_updates' => ['sometimes', 'boolean'],
            'notify_reminders' => ['sometimes', 'boolean'],
            'notify_progress' => ['sometimes', 'boolean'],
            'notify_account' => ['sometimes', 'boolean'],
            'daily_nudge_hour' => ['sometimes', 'integer', 'between:0,23'],
        ]);

        if (isset($validated['password']) && ! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The provided password is incorrect.'],
            ]);
        }
        unset($validated['current_password']);

        // Checked before the update, while $user->email is still the old one.
        $emailChanged = isset($validated['email']) && $validated['email'] !== $user->email;

        $user->update($validated);

        // A new address is unverified until proven otherwise. Without this,
        // verifying once and then changing the email would carry the verified
        // flag over to an address nobody has proven they own — and that flag
        // is the whole gate on plan generation. forceFill because
        // email_verified_at is deliberately not mass-assignable.
        if ($emailChanged) {
            $user->forceFill(['email_verified_at' => null])->save();
            $user->sendEmailVerificationNotification();
        }

        // Same shape as show() — AccountScreen writes this response straight
        // into the shared ['user'] cache, so returning the bare model here
        // would silently drop the generation fields other screens read.
        return new UserResource($user);
    }

    public function export(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => $user,
            'plans' => $user->plans()->with('steps.resources')->get(),
        ]);
    }

    public function destroy(Request $request)
    {
        $validated = $request->validate([
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['The provided password is incorrect.'],
            ]);
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->noContent();
    }
}
