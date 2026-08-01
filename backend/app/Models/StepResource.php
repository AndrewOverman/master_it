<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StepResource extends Model
{
    use HasFactory;

    protected $fillable = [
        'plan_step_id',
        'url',
        'title',
        'source',
        'description',
        'order',
    ];

    public function step(): BelongsTo
    {
        return $this->belongsTo(PlanStep::class, 'plan_step_id');
    }
}
