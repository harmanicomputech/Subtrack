<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BankConnectionController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\CancellationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SavingsController;
use App\Http\Controllers\Api\DashboardController;

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('bank-connections', BankConnectionController::class);
    Route::post('bank-connections/{id}/sync', [BankConnectionController::class, 'sync']);

    Route::apiResource('transactions', TransactionController::class)->only(['index', 'show']);

    Route::apiResource('subscriptions', SubscriptionController::class);
    Route::post('subscriptions/detect', [SubscriptionController::class, 'detect']);

    Route::apiResource('cancellations', CancellationController::class);

    Route::get('notifications', [NotificationController::class, 'index']);
    Route::patch('notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);

    Route::get('savings', [SavingsController::class, 'index']);

    Route::get('dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('dashboard/upcoming-renewals', [DashboardController::class, 'upcomingRenewals']);
    Route::get('dashboard/spend-by-category', [DashboardController::class, 'spendByCategory']);
});
