<?php

namespace App\Enums;

/**
 * Every notification the app can send.
 *
 * Three facts hang off each type — which category can switch it off,
 * whether it's transactional, and how it ranks when several qualify at
 * once. Keeping them as methods on one enum is what stops those three
 * from drifting into separate lookup arrays that disagree.
 */
enum NotificationType: string
{
    // Plan updates — the loop-closing ones.
    case PlanReady = 'plan_ready';
    case PlanFailed = 'plan_failed';
    case PlanRejected = 'plan_rejected';
    case RefinementApplied = 'refinement_applied';
    case RefinementFailed = 'refinement_failed';

    // Reminders — the daily nudge.
    case StepsDueToday = 'steps_due_today';
    case StepsOverdue = 'steps_overdue';

    // Progress — momentum and celebration.
    case OneStepLeft = 'one_step_left';
    case PlanHalfway = 'plan_halfway';
    case WeeklyRecap = 'weekly_recap';
    case StreakAtRisk = 'streak_at_risk';
    case StreakMilestone = 'streak_milestone';

    // Account — subscription and allowance.
    case GenerationsRefreshed = 'generations_refreshed';
    case SubscriptionExpiring = 'subscription_expiring';
    case PaymentIssue = 'payment_issue';
    case VerifyEmailReminder = 'verify_email_reminder';

    public function category(): NotificationCategory
    {
        return match ($this) {
            self::PlanReady,
            self::PlanFailed,
            self::PlanRejected,
            self::RefinementApplied,
            self::RefinementFailed => NotificationCategory::PlanUpdates,

            self::StepsDueToday,
            self::StepsOverdue => NotificationCategory::Reminders,

            self::OneStepLeft,
            self::PlanHalfway,
            self::WeeklyRecap,
            self::StreakAtRisk,
            self::StreakMilestone => NotificationCategory::Progress,

            self::GenerationsRefreshed,
            self::SubscriptionExpiring,
            self::PaymentIssue,
            self::VerifyEmailReminder => NotificationCategory::Account,
        };
    }

    /**
     * Transactional types close a loop the user opened themselves, so they
     * ignore quiet hours and the daily budget.
     *
     * Someone who tapped "create plan" and backgrounded the app is waiting
     * for exactly one message; holding it until tomorrow morning because
     * they already got a nudge today would make the app look broken. Every
     * one of these is a direct consequence of an action taken minutes ago,
     * which is also why none of them can arrive in a stream.
     */
    public function isTransactional(): bool
    {
        return $this->category() === NotificationCategory::PlanUpdates;
    }

    /**
     * Rank when several scheduled types qualify on the same day. Lower
     * sorts first and becomes the notification's headline.
     *
     * The ordering is roughly "costs the user money" > "the thing they
     * asked to be reminded about" > "encouragement" > "housekeeping".
     */
    public function priority(): int
    {
        return match ($this) {
            self::PaymentIssue => 10,
            self::SubscriptionExpiring => 20,
            self::StepsDueToday => 30,
            self::StepsOverdue => 31,
            self::OneStepLeft => 40,
            // Above StreakAtRisk: reaching a milestone and being at risk of
            // losing it are both true on the same morning, and "you hit 7
            // days" is the better thing to lead with than "don't lose it".
            self::StreakMilestone => 45,
            self::StreakAtRisk => 50,
            self::WeeklyRecap => 60,
            self::PlanHalfway => 70,
            self::GenerationsRefreshed => 90,
            self::VerifyEmailReminder => 100,

            // Transactional types never compete for the daily slot, so
            // their rank is never consulted.
            default => 999,
        };
    }
}
