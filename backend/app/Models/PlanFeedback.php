<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlanFeedback extends Model
{
    use HasFactory;

    // "Feedback" is uncountable, so Eloquent's auto-pluralization would
    // otherwise guess "plan_feedbacks".
    protected $table = 'plan_feedback';

    protected $fillable = [
        'plan_id',
        'rating',
        'tags',
    ];

    // Maps each chip shown on the completion modal to which side it renders
    // on. PlanController validates incoming tags against availableTags()
    // below, so this is the one place the set of valid tags is defined —
    // mirrors GeneratePlanSteps::TAG_INSTRUCTIONS, but kept separate since
    // this is retrospective feedback on a finished plan, not a same-plan
    // refinement request.
    public const TAGS = [
        'well_paced' => 'positive',
        'right_difficulty' => 'positive',
        'clear_steps' => 'positive',
        'helpful_resources' => 'positive',
        'too_vague' => 'negative',
        'too_easy' => 'negative',
        'too_hard' => 'negative',
        'unrealistic_timeline' => 'negative',
    ];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /**
     * @return list<string>
     */
    public static function availableTags(): array
    {
        return array_keys(self::TAGS);
    }
}
