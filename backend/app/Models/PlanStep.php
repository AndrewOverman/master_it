<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlanStep extends Model
{
    use HasFactory;

    protected $fillable = [
        'plan_id',
        'order',
        'title',
        'description',
        'estimated_days',
        'due_date',
        'completed_at',
        'video_url',
        'video_title',
        'video_channel',
        'video_view_count',
        'video_published_at',
        'resources_fetched_at',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'completed_at' => 'datetime',
            'video_published_at' => 'datetime',
            'resources_fetched_at' => 'datetime',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function resources(): HasMany
    {
        return $this->hasMany(StepResource::class)->orderBy('order');
    }
}
