<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Services\SubscriptionDetectorService;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function index(Request $request)
    {
        return Subscription::where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();
    }

    public function show(Request $request, int $id)
    {
        return Subscription::where('user_id', $request->user()->id)
            ->findOrFail($id);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'merchantName' => 'required|string',
            'amount' => 'required|numeric|min:0',
            'currency' => 'required|string|size:3',
            'billingCycle' => 'required|in:monthly,yearly,weekly',
            'nextRenewalDate' => 'nullable|date',
            'category' => 'nullable|string',
            'status' => 'required|in:active,paused,cancelled',
        ]);

        $sub = Subscription::create([
            'user_id' => $request->user()->id,
            'merchant_name' => $validated['merchantName'],
            'amount' => $validated['amount'],
            'currency' => $validated['currency'],
            'billing_cycle' => $validated['billingCycle'],
            'next_renewal_date' => $validated['nextRenewalDate'] ?? null,
            'category' => $validated['category'] ?? null,
            'status' => $validated['status'],
            'confidence_score' => 1.0,
        ]);

        return response()->json($sub, 201);
    }

    public function update(Request $request, int $id)
    {
        $sub = Subscription::where('user_id', $request->user()->id)->findOrFail($id);

        $validated = $request->validate([
            'status' => 'sometimes|in:active,paused,cancelled',
            'nextRenewalDate' => 'sometimes|nullable|date',
            'category' => 'sometimes|nullable|string',
        ]);

        $sub->update($validated);

        return response()->json($sub);
    }

    public function destroy(Request $request, int $id)
    {
        $sub = Subscription::where('user_id', $request->user()->id)->findOrFail($id);
        $sub->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function detect(Request $request, SubscriptionDetectorService $detector)
    {
        $detected = $detector->detect($request->user()->id);
        return response()->json(['detected' => count($detected), 'subscriptions' => $detected]);
    }
}
