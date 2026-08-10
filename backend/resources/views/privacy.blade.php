<x-legal-layout title="Privacy Policy">

    <p>
        Master It is a learning-plan app: you describe a goal, and the app builds
        a step-by-step plan you can track. This policy explains what the app
        collects, what leaves our servers, and how to get your data back or
        delete it.
    </p>
    <p>
        The app is published by {{ config('legal.entity') }} ("we", "us"). You can
        reach us at
        <a href="mailto:{{ config('legal.contact_email') }}">{{ config('legal.contact_email') }}</a>.
    </p>

    <h2>What we collect</h2>

    <h3>Your account</h3>
    <p>
        Your name, email address, and a password. Passwords are stored only as a
        one-way hash &mdash; we never hold the password itself and cannot recover
        it for you. We also record whether your email address has been verified.
    </p>

    <h3>What you create in the app</h3>
    <ul>
        <li>The goal you describe, and the skill level, time commitment, and plan length you choose.</li>
        <li>The generated plan: its title, steps, descriptions, and due dates.</li>
        <li>Your progress &mdash; which steps you have checked off, and when.</li>
        <li>Notes and tags you submit when asking for a plan to be revised.</li>
        <li>Ratings and tags you submit as feedback on a finished plan.</li>
    </ul>

    <h3>Subscription information</h3>
    <p>
        Your subscription tier, its status and renewal date, which app store it
        came from, and an identifier linking your account to our payments
        provider. We also count how many plans you have generated in the current
        period, in order to enforce your plan's allowance.
    </p>
    <div class="callout">
        <p>
            We never see or store your card details. Payments are handled entirely
            by Apple or Google under their own terms; they tell us only whether a
            subscription is active and when it expires.
        </p>
    </div>

    <h3>Technical information</h3>
    <p>
        Your IP address is used to rate-limit sign-in, sign-up, and password-reset
        attempts, which is how we keep accounts from being attacked by brute
        force. Our server logs record errors and diagnostic events; these include
        internal identifiers such as your account and plan ID, and can include
        step titles, but not the text of your goal.
    </p>
    <h3>Product analytics and error reports</h3>
    <p>
        The app records a fixed, named list of events so we can tell whether it
        actually works &mdash; whether plans finish generating, whether people
        complete them, and whether the subscription screen makes sense. Each
        event carries your account identifier and categorical details only: which
        screen you came from, your subscription tier, a step count, how long a
        plan took to generate.
    </p>
    <p>
        <strong>
            No text you write is ever included in an event. Not your goal, not
            your revision notes, not your plan titles.
        </strong>
        There is no automatic capture of taps or screens, and no session
        recording &mdash; nothing is collected that is not on that fixed list.
    </p>
    <p>
        When the app hits an error, we send a crash report containing the error
        and where in the code it happened, along with your account identifier so
        we can tell whether a problem affects one person or everyone. Crash
        reports are configured not to include request contents or your IP
        address.
    </p>
    <p>
        We do not use advertising identifiers, and we do not track you across
        other apps or websites.
    </p>

    <h2>How we use it</h2>
    <ul>
        <li>To create and store your plans, and to show your progress.</li>
        <li>To operate your account, including sign-in and password resets.</li>
        <li>To enforce the generation allowance included with your subscription.</li>
        <li>To send you transactional email &mdash; address verification and password resets. We do not send marketing email.</li>
        <li>To investigate errors, abuse, and security incidents.</li>
    </ul>
    <p>We do not sell your personal information, and we do not share it for advertising.</p>

    <h2>Who we send data to</h2>
    <p>
        Building a plan requires sending parts of what you write to other
        companies. This is the complete list, and exactly what each one receives:
    </p>

    <table>
        <thead>
            <tr><th>Service</th><th>What it receives</th><th>Why</th></tr>
        </thead>
        <tbody>
            <tr>
                <td>Anthropic (Claude)</td>
                <td>
                    The goal you describe, your chosen skill level, time commitment,
                    and plan length. When you ask for a revision, your current steps
                    and the note you wrote. When suggested reading is fetched, the
                    title and description of that step. <strong>Not</strong> your
                    name, email address, or account identifier.
                </td>
                <td>Generating plan steps, and searching the web for related reading</td>
            </tr>
            <tr>
                <td>Google (YouTube Data API)</td>
                <td>A search query built from your goal and a step title.</td>
                <td>Finding a relevant tutorial video for a step</td>
            </tr>
            <tr>
                <td>RevenueCat</td>
                <td>Your numeric account identifier and your purchase state.</td>
                <td>Managing subscriptions across app stores</td>
            </tr>
            <tr>
                <td>Apple / Google</td>
                <td>Your purchase, handled under their own privacy policies.</td>
                <td>Processing payment and renewals</td>
            </tr>
            <tr>
                <td>Resend</td>
                <td>Your email address and the contents of the message.</td>
                <td>Sending verification and password-reset email</td>
            </tr>
            <tr>
                <td>PostHog</td>
                <td>
                    Your account identifier, your subscription tier, and the named
                    events described above. <strong>Not</strong> your name, email
                    address, or anything you have written.
                </td>
                <td>Understanding whether the app works and where people get stuck</td>
            </tr>
            <tr>
                <td>Sentry</td>
                <td>Error details and your account identifier, when something goes wrong.</td>
                <td>Finding and fixing crashes and server errors</td>
            </tr>
            <tr>
                <td>Supabase, Railway</td>
                <td>Hosting for our database and application servers, in the United States.</td>
                <td>Running the service</td>
            </tr>
        </tbody>
    </table>

    <p>
        We may also disclose information where we are legally required to, or
        where it is necessary to investigate abuse or protect the safety of
        someone.
    </p>

    <h2>Plans are written by AI</h2>
    <p>
        Plan steps, the suggested reading, and the video selections are produced
        by an automated system. They can be wrong, outdated, or unsuitable for
        you. Read the <a href="/terms">Terms of Service</a> for what that means
        for how you use them &mdash; particularly for goals involving health,
        fitness, diet, finance, or anything physically risky.
    </p>

    <h2>Sharing a plan</h2>
    <p>
        If you choose to share a plan, we create a secret link to it. Anyone with
        that link can view the plan and copy it. Share links expire automatically
        after 30 days, and you can revoke one at any time from the app. Nothing is
        shared unless you deliberately share it.
    </p>
    <p>
        The public page a share link opens deliberately shows nothing about the
        plan itself &mdash; only a prompt to open the app.
    </p>

    <h2>Getting your data, and deleting it</h2>
    <p>
        Both of these are built into the app rather than being requests you have
        to make of us:
    </p>
    <ul>
        <li>
            <strong>Export.</strong> You can download everything on your account
            &mdash; your profile and every plan, step, and linked resource &mdash;
            as a machine-readable file.
        </li>
        <li>
            <strong>Deletion.</strong> Deleting your account from Settings removes
            your account and the plans, steps, progress, feedback, and sign-in
            tokens attached to it. This is immediate and cannot be undone.
        </li>
    </ul>
    <p>
        Some traces persist briefly after deletion: server logs and encrypted
        backups may retain records for a short period before rotating out, and
        anything already sent to the services listed above is subject to their
        retention, not ours. We keep account data for as long as the account
        exists.
    </p>

    <h2>Your rights</h2>
    <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete your personal information, to object to or restrict
        certain processing, and to complain to your data-protection regulator. The
        export and delete features above cover most of these directly; for
        anything else, email us and we will respond.
    </p>
    <p>
        We do not sell personal information or share it for cross-context
        behavioural advertising, as those terms are used under California law.
    </p>

    <h2>Children</h2>
    <p>
        Master It is not intended for children under 13, and we do not knowingly
        collect information from them. If you believe a child has created an
        account, email us and we will delete it.
    </p>

    <h2>Security</h2>
    <p>
        Traffic between the app and our servers is encrypted in transit. Passwords
        are hashed. Sign-in uses revocable tokens rather than storing your
        password on your device, and deleting your account revokes them all. No
        service can promise perfect security, but we take it seriously.
    </p>

    <h2>Changes</h2>
    <p>
        If we change this policy, we will update the date at the top of this page.
        Material changes will be brought to your attention in the app.
    </p>

</x-legal-layout>
