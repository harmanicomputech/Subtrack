<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankConnection;
use App\Models\Transaction;
use App\Services\SubscriptionDetectorService;
use Illuminate\Http\Request;
use Carbon\Carbon;

class BankConnectionController extends Controller
{
    public function index(Request $request)
    {
        return BankConnection::where('user_id', $request->user()->id)->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'institutionName' => 'required|string',
            'accountType' => 'required|string',
        ]);

        $connection = BankConnection::create([
            'user_id' => $request->user()->id,
            'institution_name' => $validated['institutionName'],
            'account_type' => $validated['accountType'],
            'status' => 'connected',
            'last_synced_at' => null,
        ]);

        return response()->json($connection, 201);
    }

    public function sync(Request $request, int $id, SubscriptionDetectorService $detector)
    {
        $connection = BankConnection::where('user_id', $request->user()->id)->findOrFail($id);

        $merchants = [
            ['name' => 'Netflix', 'amount' => -15.99, 'category' => 'Entertainment'],
            ['name' => 'Spotify', 'amount' => -9.99, 'category' => 'Entertainment'],
            ['name' => 'Amazon Prime', 'amount' => -8.99, 'category' => 'Shopping'],
            ['name' => 'Apple', 'amount' => -0.99, 'category' => 'Technology'],
            ['name' => 'Disney+', 'amount' => -7.99, 'category' => 'Entertainment'],
            ['name' => 'Gym', 'amount' => -40.00, 'category' => 'Health & Fitness'],
        ];

        foreach ($merchants as $merchant) {
            for ($i = 0; $i < 4; $i++) {
                Transaction::firstOrCreate([
                    'user_id' => $request->user()->id,
                    'bank_connection_id' => $connection->id,
                    'merchant_name' => $merchant['name'],
                    'transaction_date' => Carbon::now()->subMonths($i)->startOfMonth(),
                ], [
                    'amount' => $merchant['amount'],
                    'currency' => 'GBP',
                    'description' => $merchant['name'],
                    'category' => $merchant['category'],
                    'is_subscription' => true,
                ]);
            }
        }

        $connection->update(['last_synced_at' => now(), 'status' => 'connected']);

        $detected = $detector->detect($request->user()->id);

        return response()->json([
            'message' => 'Sync complete',
            'transactionsAdded' => count($merchants) * 4,
            'subscriptionsDetected' => count($detected),
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $connection = BankConnection::where('user_id', $request->user()->id)->findOrFail($id);
        $connection->delete();
        return response()->json(['message' => 'Deleted']);
    }
}
