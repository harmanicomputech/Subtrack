import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/subscription.dart';

final subscriptionsProvider = FutureProvider<List<Subscription>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final response = await api.get('/subscriptions');
  return (response.data as List).map((e) => Subscription.fromJson(e as Map<String, dynamic>)).toList();
});

class SubscriptionsScreen extends ConsumerWidget {
  const SubscriptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subsAsync = ref.watch(subscriptionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscriptions'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(subscriptionsProvider),
          ),
        ],
      ),
      body: subsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (subs) => subs.isEmpty
            ? const Center(child: Text('No subscriptions detected yet.\nConnect a bank account to get started.', textAlign: TextAlign.center))
            : ListView.builder(
                itemCount: subs.length,
                itemBuilder: (ctx, i) {
                  final sub = subs[i];
                  return ListTile(
                    title: Text(sub.merchantName),
                    subtitle: Text('${sub.billingCycle} · ${sub.status}'),
                    trailing: Text('£${sub.amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    onTap: () => context.push('/subscriptions/${sub.id}'),
                  );
                },
              ),
      ),
    );
  }
}
