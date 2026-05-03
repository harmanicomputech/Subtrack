import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiClientProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [TextButton(onPressed: () async { await api.post('/notifications/read-all'); }, child: const Text('Mark all read'))],
      ),
      body: FutureBuilder(
        future: api.get('/notifications'),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
          final list = snap.data?.data as List? ?? [];
          if (list.isEmpty) return const Center(child: Text('No notifications.'));
          return ListView.builder(
            itemCount: list.length,
            itemBuilder: (ctx, i) {
              final n = list[i] as Map<String, dynamic>;
              return ListTile(
                leading: Icon(n['isRead'] == true ? Icons.notifications_none : Icons.notifications, color: n['isRead'] == true ? null : Colors.blue),
                title: Text(n['title'] as String),
                subtitle: Text(n['message'] as String),
              );
            },
          );
        },
      ),
    );
  }
}
