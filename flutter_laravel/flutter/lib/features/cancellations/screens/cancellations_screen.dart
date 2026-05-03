import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';

class CancellationsScreen extends ConsumerWidget {
  const CancellationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiClientProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Cancellations')),
      body: FutureBuilder(
        future: api.get('/cancellations'),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('Error: ${snap.error}'));
          final list = snap.data?.data as List? ?? [];
          if (list.isEmpty) return const Center(child: Text('No cancellation requests yet.'));
          return ListView.builder(
            itemCount: list.length,
            itemBuilder: (ctx, i) {
              final c = list[i] as Map<String, dynamic>;
              return ListTile(
                title: Text(c['subscriptionName'] as String),
                subtitle: Text(c['method'] as String),
                trailing: Chip(label: Text(c['status'] as String)),
              );
            },
          );
        },
      ),
    );
  }
}
