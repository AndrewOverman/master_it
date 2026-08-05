<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', Password::min(8)->mixedCase()->numbers()->uncompromised()],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        event(new Registered($user));

        $token = $user->createToken('mobile')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($validated)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $user = User::where('email', $validated['email'])->firstOrFail();
        $token = $user->createToken('mobile')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
        ]);

        PasswordBroker::sendResetLink($validated);

        // Same response whether or not the email is registered — surfacing
        // the broker's real status here would let this endpoint be used to
        // enumerate accounts by email.
        return response()->json([
            'message' => 'If that email is registered, a reset link is on its way.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', Password::min(8)->mixedCase()->numbers()->uncompromised()],
        ]);

        $status = PasswordBroker::reset(
            $validated,
            function (User $user) use ($validated) {
                $user->forceFill(['password' => Hash::make($validated['password'])])->save();

                // A reset should invalidate every existing session — otherwise
                // whoever/whatever had the old credentials (or an already
                // compromised token) keeps access after the "fix".
                $user->tokens()->delete();

                event(new PasswordReset($user));
            }
        );

        if ($status === PasswordBroker::RESET_THROTTLED) {
            throw ValidationException::withMessages([
                'email' => ['Please wait a moment before trying again.'],
            ]);
        }

        if ($status !== PasswordBroker::PASSWORD_RESET) {
            // Collapses "no such user" and "bad/expired token" into one
            // message deliberately — same enumeration concern as above.
            throw ValidationException::withMessages([
                'email' => ['That reset link is invalid or has expired. Request a new one.'],
            ]);
        }

        return response()->json(['message' => 'Password updated. Please log in again.']);
    }
}
