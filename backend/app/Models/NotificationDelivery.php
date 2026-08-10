<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per notification actually handed to Expo. Written by
 * PushNotificationService before the send, never by anything else —
 * see that class for why the write happens first.
 */
class NotificationDelivery extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'type',
        'dedupe_key',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
