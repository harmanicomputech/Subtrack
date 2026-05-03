<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Savings;
use Illuminate\Http\Request;

class SavingsController extends Controller
{
    public function index(Request $request)
    {
        return Savings::where('user_id', $request->user()->id)
            ->with('cancellationRequest.subscription')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($saving) {
                return [
                    'id' => $saving->id,
                    'amountSaved' => $saving->amount_saved,
                    'currency' => $saving->currency,
                    'subscriptionName' => $saving->cancellationRequest?->subscription?->merchant_name ?? 'Unknown',
                    'notes' => $saving->notes,
                    'createdAt' => $saving->created_at,
                ];
            });
    }
}
