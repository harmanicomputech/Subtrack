<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\Subscription;
use Carbon\Carbon;

class SubscriptionDetectorService
{
    private array $knownMerchants = [
        'Netflix' => ['category' => 'Entertainment', 'billingCycle' => 'monthly'],
        'Spotify' => ['category' => 'Entertainment', 'billingCycle' => 'monthly'],
        'Amazon Prime' => ['category' => 'Shopping', 'billingCycle' => 'monthly'],
        'Apple' => ['category' => 'Technology', 'billingCycle' => 'monthly'],
        'Google' => ['category' => 'Technology', 'billingCycle' => 'monthly'],
        'Microsoft' => ['category' => 'Technology', 'billingCycle' => 'monthly'],
        'Disney+' => ['category' => 'Entertainment', 'billingCycle' => 'monthly'],
        'Sky' => ['category' => 'Entertainment', 'billingCycle' => 'monthly'],
        'Gym' => ['category' => 'Health & Fitness', 'billingCycle' => 'monthly'],
        'Adobe' => ['category' => 'Technology', 'billingCycle' => 'monthly'],
        'Audible' => ['category' => 'Entertainment', 'billingCycle' => 'monthly'],
        'Deliveroo Plus' => ['category' => 'Food & Drink', 'billingCycle' => 'monthly'],
    ];

    public function detect(int $userId): array
    {
        $transactions = Transaction::where('user_id', $userId)
            ->where('amount', '<', 0)
            ->get();

        $merchantGroups = $transactions->groupBy('merchant_name');
        $detected = [];

        foreach ($merchantGroups as $merchantName => $txns) {
            if ($txns->count() < 2) continue;

            $knownInfo = null;
            foreach ($this->knownMerchants as $pattern => $info) {
                if (stripos($merchantName, $pattern) !== false) {
                    $knownInfo = $info;
                    break;
                }
            }

            if (!$knownInfo) continue;

            $existing = Subscription::where('user_id', $userId)
                ->where('merchant_name', $merchantName)
                ->first();

            if ($existing) continue;

            $avgAmount = abs($txns->avg('amount'));
            $latestTxn = $txns->sortByDesc('transaction_date')->first();
            $nextRenewal = Carbon::parse($latestTxn->transaction_date)->addMonth();

            $sub = Subscription::create([
                'user_id' => $userId,
                'merchant_name' => $merchantName,
                'amount' => $avgAmount,
                'currency' => 'GBP',
                'billing_cycle' => $knownInfo['billingCycle'],
                'next_renewal_date' => $nextRenewal,
                'category' => $knownInfo['category'],
                'status' => 'active',
                'confidence_score' => 0.9,
            ]);

            $detected[] = $sub;
        }

        return $detected;
    }
}
