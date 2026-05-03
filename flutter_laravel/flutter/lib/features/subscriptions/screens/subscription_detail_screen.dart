import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/subscription.dart';

final subscriptionDetailProvider = FutureProvider.family<Subscription, int>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final response = await api.get('/subscriptions/$id');
  return Subscription.fromJson(response.data as Map<String, dynamic>);
});

class SubscriptionDetailScreen extends ConsumerWidget {
  final int id;
  const SubscriptionDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subAsync = ref.watch(subscriptionDetailProvider(id));

    return Scaffold(
      appBar: AppBar(title: const Text('Subscription Details')),
      body: subAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (sub) => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(sub.merchantName, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('£${sub.amount.toStringAsFixed(2)} / ${sub.billingCycle}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 24),
              _DetailRow(label: 'Status', value: sub.status.toUpperCase()),
              _DetailRow(label: 'Category', value: sub.category ?? 'Uncategorised'),
              _DetailRow(label: 'Next Renewal', value: sub.nextRenewalDate ?? 'Unknown'),
              _DetailRow(label: 'Confidence', value: '${(sub.confidenceScore * 100).toStringAsFixed(0)}%'),
              const Spacer(),
              if (sub.status == 'active')
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonal(
                    style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.errorContainer),
                    onPressed: () => _showCancelDialog(context, ref, sub),
                    child: const Text('Cancel Subscription'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showCancelDialog(BuildContext context, WidgetRef ref, Subscription sub) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Subscription'),
        content: Text('Are you sure you want to cancel ${sub.merchantName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep')),
          FilledButton(
            onPressed: () async {
              final api = ref.read(apiClientProvider);
              await api.post('/cancellations', data: {'subscriptionId': sub.id, 'method': 'email'});
              if (ctx.mounted) Navigator.pop(ctx);
              if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Cancellation initiated')));
            },
            child: const Text('Cancel Subscription'),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          Text(value, style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
