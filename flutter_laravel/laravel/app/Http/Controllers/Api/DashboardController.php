<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\Savings;
use App\Models\Notification;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $userId = $request->user()->id;

        $allSubs = Subscription::where('user_id', $userId)->get();
        $activeSubs = $allSubs->where('status', 'active');
        $cancelledSubs = $allSubs->where('status', 'cancelled');

        $totalMonthlySpend = $activeSubs->sum(function ($sub) {
            return match ($sub->billing_cycle) {
                'monthly' => $sub->amount,
                'yearly' => $sub->amount / 12,
                'weekly' => $sub->amount * 4.33,
                default => 0,
            };
        });

        $now = now();
        $upcoming = $activeSubs->filter(fn($s) =>
            $s->next_renewal_date && $s->next_renewal_date->between($now, $now->copy()->addDays(30))
        );

        $totalSaved = Savings::where('user_id', $userId)->sum('amount_saved');
        $unreadCount = Notification::where('user_id', $userId)->where('is_read', false)->count();

        return response()->json([
            'totalMonthlySpend' => round($totalMonthlySpend, 2),
            'totalYearlySpend' => round($totalMonthlySpend * 12, 2),
            'activeSubscriptions' => $activeSubs->count(),
            'cancelledSubscriptions' => $cancelledSubs->count(),
            'totalSaved' => round($totalSaved, 2),
            'upcomingRenewalsCount' => $upcoming->count(),
            'unreadNotifications' => $unreadCount,
        ]);
    }

    public function upcomingRenewals(Request $request)
    {
        $userId = $request->user()->id;
        $now = now();

        return Subscription::where('user_id', $userId)
            ->where('status', 'active')
            ->whereNotNull('next_renewal_date')
            ->whereBetween('next_renewal_date', [$now, $now->copy()->addDays(30)])
            ->orderBy('next_renewal_date')
            ->get();
    }

    public function spendByCategory(Request $request)
    {
        $userId = $request->user()->id;

        $subs = Subscription::where('user_id', $userId)
            ->where('status', 'active')
            ->get();

        $categories = [];
        foreach ($subs as $sub) {
            $cat = $sub->category ?? 'Other';
            $monthly = match ($sub->billing_cycle) {
                'monthly' => $sub->amount,
                'yearly' => $sub->amount / 12,
                'weekly' => $sub->amount * 4.33,
                default => 0,
            };
            if (!isset($categories[$cat])) {
                $categories[$cat] = ['category' => $cat, 'amount' => 0, 'count' => 0];
            }
            $categories[$cat]['amount'] += $monthly;
            $categories[$cat]['count']++;
        }

        return response()->json(array_values(array_map(function ($c) {
            $c['amount'] = round($c['amount'], 2);
            return $c;
        }, $categories)));
    }
}
