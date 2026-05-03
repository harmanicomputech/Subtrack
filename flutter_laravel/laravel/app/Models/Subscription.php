<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    protected $fillable = [
        'user_id', 'merchant_name', 'amount', 'currency',
        'billing_cycle', 'next_renewal_date', 'category',
        'status', 'confidence_score', 'bank_connection_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'confidence_score' => 'float',
        'next_renewal_date' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function cancellations(): HasMany
    {
        return $this->hasMany(CancellationRequest::class);
    }
}
