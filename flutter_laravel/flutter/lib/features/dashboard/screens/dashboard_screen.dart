import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/dashboard_summary.dart';

final dashboardSummaryProvider = FutureProvider<DashboardSummary>((ref) async {
  final api = ref.watch(apiClientProvider);
  final response = await api.get('/dashboard/summary');
  return DashboardSummary.fromJson(response.data as Map<String, dynamic>);
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(dashboardSummaryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('SubTrack'), actions: [
        IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () => context.push('/notifications')),
      ]),
      body: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (summary) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Monthly Spend', style: Theme.of(context).textTheme.labelLarge),
              Text('£${summary.totalMonthlySpend.toStringAsFixed(2)}',
                  style: Theme.of(context).textTheme.displayMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('£${summary.totalYearlySpend.toStringAsFixed(2)}/year',
                  style: Theme.of(context).textTheme.bodyLarge),
              const SizedBox(height: 24),
              Row(children: [
                Expanded(child: _StatCard(label: 'Active', value: '${summary.activeSubscriptions}', color: Colors.blue)),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(label: 'Cancelled', value: '${summary.cancelledSubscriptions}', color: Colors.red)),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(label: 'Saved', value: '£${summary.totalSaved.toStringAsFixed(0)}', color: Colors.green)),
              ]),
              const SizedBox(height: 24),
              if (summary.upcomingRenewalsCount > 0)
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: ListTile(
                    leading: const Icon(Icons.warning_amber_outlined),
                    title: Text('${summary.upcomingRenewalsCount} renewal(s) due soon'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/subscriptions'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(value, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: color, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
