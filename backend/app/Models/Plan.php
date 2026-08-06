<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Plan extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'source_plan_id',
        'title',
        'emoji',
        'original_prompt',
        'status',
        'completed_at',
        'error_message',
        'rejection_category',
        'skill_level',
        'time_commitment',
        'target_days',
    ];

    private const SHARE_TOKEN_LIFETIME_DAYS = 30;

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
            'share_token_expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function steps(): HasMany
    {
        return $this->hasMany(PlanStep::class)->orderBy('order');
    }

    public function sourcePlan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'source_plan_id');
    }

    public function refinements(): HasMany
    {
        return $this->hasMany(PlanRefinement::class);
    }

    public function latestRefinement(): HasOne
    {
        return $this->hasOne(PlanRefinement::class)->latestOfMany();
    }

    /**
     * Returns this plan's share token, minting one (with a fresh 30-day
     * expiry) the first time it's called or whenever the existing one has
     * expired — so tapping "Share" again after a link has lapsed just
     * works instead of handing back a dead token. Kept out of $fillable
     * so it can only ever be set here, never via mass assignment from a
     * request.
     */
    public function shareToken(): string
    {
        if (! $this->share_token || $this->isShareTokenExpired()) {
            $this->share_token = Str::random(40);
            $this->share_token_expires_at = now()->addDays(self::SHARE_TOKEN_LIFETIME_DAYS);
            $this->save();
        }

        return $this->share_token;
    }

    public function isShareTokenExpired(): bool
    {
        return $this->share_token_expires_at !== null && $this->share_token_expires_at->isPast();
    }

    /**
     * The one place "is this share token usable" is decided — an unknown,
     * expired, or not-yet-ready plan all collapse to null here, so every
     * caller (the API resource lookup, the public web redirect) treats them
     * identically rather than each re-implementing the same two checks.
     */
    public static function findValidByShareToken(string $token): ?self
    {
        $plan = static::where('share_token', $token)->first();

        return ($plan && $plan->status === 'ready' && ! $plan->isShareTokenExpired()) ? $plan : null;
    }

    public function revokeShareToken(): void
    {
        // update() is mass assignment and these are deliberately not
        // fillable, so it'd silently no-op — set the attributes directly.
        $this->share_token = null;
        $this->share_token_expires_at = null;
        $this->save();
    }

    /**
     * Clones this plan (and its steps/resources) into $user's own plans.
     * Shared by the featured-plan copy flow and the share-link copy flow —
     * both hand a caller a snapshot of someone else's plan, not a live
     * link to it.
     */
    public function cloneForUser(User $user): self
    {
        $copy = $user->plans()->create([
            'source_plan_id' => $this->id,
            'title' => $this->title,
            'emoji' => $this->emoji,
            'original_prompt' => $this->original_prompt,
            'status' => 'ready',
            'skill_level' => $this->skill_level,
            'time_commitment' => $this->time_commitment,
            'target_days' => $this->target_days,
        ]);

        // Mirrors GeneratePlanSteps::handle()'s cumulative-due-date logic,
        // anchored on now() instead of the source plan's original
        // created_at so the copy's due dates land in the future.
        $cumulativeDays = 0;
        foreach ($this->steps()->with('resources')->get() as $step) {
            $cumulativeDays += $step->estimated_days ?? 0;

            $newStep = $copy->steps()->create([
                'order' => $step->order,
                'title' => $step->title,
                'description' => $step->description,
                'estimated_days' => $step->estimated_days,
                'due_date' => now()->copy()->addDays($cumulativeDays),
                'video_url' => $step->video_url,
                'video_title' => $step->video_title,
                'video_channel' => $step->video_channel,
                'video_view_count' => $step->video_view_count,
                'video_published_at' => $step->video_published_at,
                'resources_fetched_at' => $step->resources_fetched_at,
            ]);

            foreach ($step->resources as $resource) {
                $newStep->resources()->create([
                    'url' => $resource->url,
                    'title' => $resource->title,
                    'source' => $resource->source,
                    'description' => $resource->description,
                    'order' => $resource->order,
                ]);
            }
        }

        return $copy;
    }
}
