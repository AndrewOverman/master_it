<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * These two pages are linked from the sign-up screen and the paywall, and
 * App Store review opens them from outside the app. A 404 on either is a
 * submission blocker, so their existence is worth a test rather than a
 * manual check before each release.
 */
class LegalPagesTest extends TestCase
{
    public function test_the_privacy_policy_is_publicly_reachable(): void
    {
        $this->get('/privacy')
            ->assertOk()
            ->assertSee('Privacy Policy')
            ->assertSee(config('legal.contact_email'));
    }

    public function test_the_terms_are_publicly_reachable(): void
    {
        $this->get('/terms')
            ->assertOk()
            ->assertSee('Terms of Service')
            ->assertSee(config('legal.contact_email'));
    }

    /**
     * The paths aren't arbitrary: src/lib/legal.ts derives them from
     * EXPO_PUBLIC_API_URL, so renaming one here silently breaks the links in
     * the app rather than failing anywhere visible.
     */
    public function test_each_page_links_to_the_other(): void
    {
        $this->get('/privacy')->assertSee('href="/terms"', false);
        $this->get('/terms')->assertSee('href="/privacy"', false);
    }

    public function test_the_terms_state_a_governing_jurisdiction(): void
    {
        $this->get('/terms')->assertOk()->assertSee(config('legal.jurisdiction'));
    }

    /**
     * The disclaimer is the point of the document for an app that will happily
     * write someone a marathon training plan or a diet. Losing it in an edit
     * should fail the build.
     */
    public function test_the_terms_disclaim_professional_advice(): void
    {
        $this->get('/terms')
            ->assertSee('medical, health, fitness, nutritional, legal,')
            ->assertSee('at your own risk');
    }

    /**
     * The privacy policy has to name the processors that receive user content,
     * and the goal text going to an LLM provider is the disclosure most likely
     * to be missed.
     */
    public function test_the_privacy_policy_names_the_third_parties_that_receive_content(): void
    {
        $this->get('/privacy')
            ->assertSee('Anthropic')
            ->assertSee('RevenueCat')
            ->assertSee('Resend')
            ->assertSee('YouTube Data API')
            ->assertSee('PostHog')
            ->assertSee('Sentry');
    }

    /**
     * The commitment the analytics implementation is built around: events
     * carry categorical properties only, never the user's goal or notes. If
     * that ever stops being true in src/lib/analytics.ts, this sentence has to
     * come out of the policy in the same change.
     */
    public function test_the_privacy_policy_promises_no_user_text_in_analytics(): void
    {
        $this->get('/privacy')->assertSee('No text you write is ever included in an event.');
    }
}
