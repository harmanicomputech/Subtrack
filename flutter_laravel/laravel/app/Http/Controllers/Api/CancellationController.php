<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CancellationRequest;
use App\Models\Subscription;
use App\Models\Savings;
use App\Models\Notification;
use Illuminate\Http\Request;

class CancellationController extends Controller
{
    public function index(Request $request)
    {
        return CancellationRequest::where('user_id', $request->user()->id)
            ->with('subscription')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'subscriptionId' => 'required|integer',
            'method' => 'required|in:direct_debit,email,manual',
            'notes' => 'nullable|string',
        ]);

        $sub = Subscription::where('user_id', $request->user()->id)
            ->findOrFail($validated['subscriptionId']);

        $cancellation = CancellationRequest::create([
            'user_id' => $request->user()->id,
            'subscription_id' => $sub->id,
            'method' => $validated['method'],
            'status' => 'pending',
            'notes' => $validated['notes'] ?? null,
        ]);

        $sub->update(['status' => 'cancelled']);

        $monthlySaving = match ($sub->billing_cycle) {
            'monthly' => $sub->amount,
            'yearly' => $sub->amount / 12,
            'weekly' => $sub->amount * 4.33,
            default => $sub->amount,
        };

        Savings::create([
            'user_id' => $request->user()->id,
            'cancellation_request_id' => $cancellation->id,
            'amount_saved' => $monthlySaving,
            'currency' => $sub->currency,
            'notes' => "Cancelled {$sub->merchant_name}",
        ]);

        Notification::create([
            'user_id' => $request->user()->id,
            'type' => 'cancellation_initiated',
            'title' => 'Cancellation Initiated',
            'message' => "Your cancellation request for {$sub->merchant_name} has been submitted.",
            'is_read' => false,
        ]);

        return response()->json($cancellation, 201);
    }

    public function update(Request $request, int $id)
    {
        $cancellation = CancellationRequest::where('user_id', $request->user()->id)->findOrFail($id);
        $validated = $request->validate(['status' => 'required|in:pending,sent,completed,failed']);
        $cancellation->update($validated);
        return response()->json($cancellation);
    }
}
