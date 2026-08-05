<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['key_id', 'platform', 'first_seen_at', 'last_verified_at'])]
class DeviceAttestation extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'claimed_free_generation' => 'boolean',
            'first_seen_at' => 'datetime',
            'last_verified_at' => 'datetime',
        ];
    }

    public function claimedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'claimed_by_user_id');
    }
}
