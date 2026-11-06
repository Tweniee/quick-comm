import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

/// Rider actions (pickup, arrived, call, deliver, undelivered, returned) are queued when offline and
/// synced later with the ORIGINAL time they happened (masterplan §10 "Reliability and offline").
/// The backend treats replays idempotently, so a double sync never double-charges.
class OfflineQueue {
  OfflineQueue(this.api);
  final Api api;
  static const _key = 'qd.driver.queue';

  Future<List<Map<String, dynamic>>> _read() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_key);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  Future<void> _write(List<Map<String, dynamic>> items) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, jsonEncode(items));
  }

  Future<int> get length async => (await _read()).length;

  /// Sends now; if the network is down, stores it and returns null ("Queued, will sync").
  Future<dynamic> send(String path, Map<String, dynamic> body) async {
    final stamped = {...body, 'occurredAt': DateTime.now().toUtc().toIso8601String()};
    try {
      await flush();
      return await api.post(path, stamped);
    } on ApiException catch (e) {
      if (!e.isNetwork) rethrow;
      final items = await _read();
      items.add({'path': path, 'body': stamped});
      await _write(items);
      return null;
    }
  }

  /// Replays queued actions in order. Stops at the first network failure; drops actions the server rejects.
  Future<void> flush() async {
    final items = await _read();
    while (items.isNotEmpty) {
      final it = items.first;
      try {
        await api.post(it['path'] as String, (it['body'] as Map).cast<String, dynamic>());
      } on ApiException catch (e) {
        if (e.isNetwork) break;
      }
      items.removeAt(0);
      await _write(items);
    }
  }
}
