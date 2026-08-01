<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        'skill_level',
        'time_commitment',
        'target_days',
    ];

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
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
}
