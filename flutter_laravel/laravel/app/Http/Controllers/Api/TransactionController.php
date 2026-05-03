<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use Illuminate\Http\Request;

class TransactionController extends Controller
{
    public function index(Request $request)
    {
        return Transaction::where('user_id', $request->user()->id)
            ->orderBy('transaction_date', 'desc')
            ->paginate(50);
    }

    public function show(Request $request, int $id)
    {
        return Transaction::where('user_id', $request->user()->id)->findOrFail($id);
    }
}
