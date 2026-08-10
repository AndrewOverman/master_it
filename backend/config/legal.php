<?php

return [

    // Who "we" refers to in the policy and terms. Must match the seller name
    // on the App Store / Play listing — a mismatch between the two is a
    // routine review rejection.
    'entity' => env('LEGAL_ENTITY', 'Andrew Overman'),

    // Published on both pages as the contact for privacy, deletion and
    // support requests. Apple requires a reachable address here.
    'contact_email' => env('LEGAL_CONTACT_EMAIL', 'andrewoverman0517@gmail.com'),

    // Governs the Terms and fixes the venue for disputes. Overridable, but
    // not something to change casually — if the business moves, the clause
    // moves with it.
    'jurisdiction' => env('LEGAL_JURISDICTION', 'the State of Michigan, United States'),

    // Shown as "Last updated" on both pages. Bump when the text changes.
    'last_updated' => env('LEGAL_LAST_UPDATED', '9 August 2026'),

];
