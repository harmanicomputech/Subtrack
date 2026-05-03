import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';

class SavingsScreen extends ConsumerWidget {
  const SavingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiClientProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Savings')),
      body: FutureBuilder(
        future: api.get('/savings'),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
          final list = snap.data?.data as List? ?? [];
          final total = list.fold<double>(0, (sum, s) => sum + ((s as Map<String, dynamic>)['amountSaved'] as num).toDouble());
          return Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                color: Colors.green.shade50,
                child: Column(children: [
                  Text('Total Saved', style: Theme.of(context).textTheme.titleMedium),
                  Text('£${total.toStringAsFixed(2)}', style: Theme.of(context).textTheme.displayMedium?.copyWith(color: Colors.green.shade800, fontWeight: FontWeight.bold)),
                ]),
              ),
              Expanded(
                child: list.isEmpty
                    ? const Center(child: Text('Cancel subscriptions to start saving!'))
                    : ListView.builder(
                        itemCount: list.length,
                        itemBuilder: (ctx, i) {
                          final s = list[i] as Map<String, dynamic>;
                          return ListTile(
                            title: Text(s['subscriptionName'] as String),
                            trailing: Text('£${(s['amountSaved'] as num).toStringAsFixed(2)}', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
