@props(['title'])
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} &middot; Master It</title>
    <style>
        :root { color-scheme: light dark; }
        body {
            margin: 0;
            padding: 40px 24px 96px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #FDF8F3;
            color: #2B2420;
            /* Long-form reading, unlike the other public pages: a wider
               measure than the share card, still short enough per line to
               stay readable on a desktop browser. */
            line-height: 1.6;
        }
        @media (prefers-color-scheme: dark) {
            body { background: #17130F; color: #F3EAE0; }
        }
        main { max-width: 680px; margin: 0 auto; }
        .mark {
            width: 40px; height: 40px; margin-bottom: 28px;
            border-radius: 12px; background: #B84F1E;
        }
        @media (prefers-color-scheme: dark) { .mark { background: #E08347; } }
        h1 { font-size: 28px; line-height: 1.25; margin: 0 0 8px; }
        h2 {
            font-size: 18px; line-height: 1.3; margin: 40px 0 12px;
            padding-top: 24px; border-top: 1px solid #E8DDD0;
        }
        @media (prefers-color-scheme: dark) { h2 { border-top-color: #3A322A; } }
        h3 { font-size: 15px; margin: 24px 0 6px; }
        p, li { font-size: 15px; margin: 0 0 14px; }
        ul { padding-left: 22px; margin: 0 0 14px; }
        li { margin-bottom: 8px; }
        .updated { font-size: 14px; color: #7A6355; margin-bottom: 8px; }
        @media (prefers-color-scheme: dark) { .updated { color: #8A929E; } }
        a { color: #A8461A; }
        @media (prefers-color-scheme: dark) { a { color: #E08347; } }
        table {
            width: 100%; border-collapse: collapse; margin: 0 0 20px;
            font-size: 14px; display: block; overflow-x: auto;
        }
        th, td {
            text-align: left; vertical-align: top; padding: 10px 12px 10px 0;
            border-bottom: 1px solid #E8DDD0;
        }
        @media (prefers-color-scheme: dark) { th, td { border-bottom-color: #3A322A; } }
        th { font-weight: 600; }
        .callout {
            border-left: 3px solid #B84F1E;
            padding: 2px 0 2px 16px;
            margin: 0 0 18px;
        }
        @media (prefers-color-scheme: dark) { .callout { border-left-color: #E08347; } }
        footer {
            margin-top: 48px; padding-top: 24px; font-size: 14px;
            border-top: 1px solid #E8DDD0; color: #7A6355;
        }
        @media (prefers-color-scheme: dark) {
            footer { border-top-color: #3A322A; color: #8A929E; }
        }
    </style>
</head>
<body>
    <main>
        <div class="mark"></div>
        <h1>{{ $title }}</h1>
        <p class="updated">Last updated {{ config('legal.last_updated') }}</p>

        {{ $slot }}

        <footer>
            <p>
                Questions about this document? Email
                <a href="mailto:{{ config('legal.contact_email') }}">{{ config('legal.contact_email') }}</a>.
            </p>
            <p>
                @if ($title === 'Privacy Policy')
                    See also the <a href="/terms">Terms of Service</a>.
                @else
                    See also the <a href="/privacy">Privacy Policy</a>.
                @endif
            </p>
        </footer>
    </main>
</body>
</html>
