<?php

namespace App\Enums;

/**
 * The four groups a user can independently switch off in Settings.
 *
 * Deliberately coarse. A single master toggle would mean one unwanted
 * nudge costs us the ability to say "your plan is ready" — the message
 * people actually want — while a per-type list of sixteen switches is a
 * settings screen nobody reads.
 */
enum NotificationCategory: string
{
    case PlanUpdates = 'plan_updates';
    case Reminders = 'reminders';
    case Progress = 'progress';
    case Account = 'account';

    /**
     * The `users` column holding this category's opt-in.
     */
    public function preferenceColumn(): string
    {
        return 'notify_'.$this->value;
    }

    public function label(): string
    {
        return match ($this) {
            self::PlanUpdates => 'Plan updates',
            self::Reminders => 'Reminders',
            self::Progress => 'Progress',
            self::Account => 'Account',
        };
    }

    /**
     * Shown under the label in Settings, so the switch says what it
     * actually governs rather than making people guess from one word.
     */
    public function description(): string
    {
        return match ($this) {
            self::PlanUpdates => 'When a plan finishes generating, or something goes wrong.',
            self::Reminders => 'A daily nudge about steps you\'re aiming to finish.',
            self::Progress => 'Milestones, streaks, and your weekly recap.',
            self::Account => 'Subscription, billing, and generation allowance.',
        };
    }
}
