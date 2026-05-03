<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Savings extends Model
{
    protected $fillable = [
        'user_id', 'cancellation_request_id', 'amount_saved', 'currency', 'notes',
    ];

    protected $casts = [
        'amount_saved' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
