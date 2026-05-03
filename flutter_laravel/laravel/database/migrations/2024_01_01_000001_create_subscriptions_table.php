<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('bank_connection_id')->nullable()->constrained()->nullOnDelete();
            $table->string('merchant_name');
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3)->default('GBP');
            $table->enum('billing_cycle', ['monthly', 'yearly', 'weekly'])->default('monthly');
            $table->date('next_renewal_date')->nullable();
            $table->string('category')->nullable();
            $table->enum('status', ['active', 'paused', 'cancelled'])->default('active');
            $table->float('confidence_score')->default(1.0);
            $table->timestamps();
        });

        Schema::create('cancellation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_id')->constrained()->cascadeOnDelete();
            $table->enum('method', ['direct_debit', 'email', 'manual'])->default('email');
            $table->enum('status', ['pending', 'sent', 'completed', 'failed'])->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('savings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cancellation_request_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount_saved', 10, 2);
            $table->string('currency', 3)->default('GBP');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('message');
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('savings');
        Schema::dropIfExists('cancellation_requests');
        Schema::dropIfExists('subscriptions');
    }
};
