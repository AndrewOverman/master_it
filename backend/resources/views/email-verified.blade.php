<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Master It</title>
    <style>
        :root { color-scheme: light dark; }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #FDF8F3;
            color: #2B2420;
        }
        @media (prefers-color-scheme: dark) {
            body { background: #17130F; color: #F3EAE0; }
        }
        .card { max-width: 360px; text-align: center; }
        .mark {
            width: 48px; height: 48px; margin: 0 auto 20px;
            border-radius: 14px; background: #B84F1E;
        }
        @media (prefers-color-scheme: dark) { .mark { background: #E08347; } }
        h1 { font-size: 19px; margin: 0 0 8px; }
        p { font-size: 15px; line-height: 1.5; color: #7A6B5D; margin: 0 0 24px; }
        @media (prefers-color-scheme: dark) { p { color: #B9A995; } }
        .btn {
            display: block; text-decoration: none; font-weight: 600; font-size: 15px;
            padding: 12px 20px; border-radius: 10px; margin-bottom: 12px;
            background: #B84F1E; color: #FFFFFF;
        }
        @media (prefers-color-scheme: dark) { .btn { background: #E08347; color: #17130F; } }
        .btn-secondary { background: transparent; color: inherit; border: 1px solid #E8DDD0; }
        @media (prefers-color-scheme: dark) { .btn-secondary { border-color: #3A322A; } }
    </style>
</head>
<body>
    {{-- No automatic redirect into the app, unlike the shared-plan page: the
         confirmation itself is the point, and this link is often opened on a
         desktop where there's no app to redirect to. --}}
    @if ($verified)
        <div class="card">
            <div class="mark"></div>
            <h1>Email verified</h1>
            <p>You're all set. Head back to Master It and start building a plan.</p>
            <a class="btn" href="{{ $deepLink }}">Open the Master It app</a>
            @if ($appStoreUrl)
                <a class="btn btn-secondary" href="{{ $appStoreUrl }}">Get the app</a>
            @endif
        </div>
    @else
        <div class="card">
            <div class="mark"></div>
            <h1>This link is no longer valid</h1>
            <p>Verification links expire after a while. Open Master It and tap
               &ldquo;Resend&rdquo; to get a fresh one.</p>
            <a class="btn" href="{{ $deepLink }}">Open the Master It app</a>
        </div>
    @endif
</body>
</html>
