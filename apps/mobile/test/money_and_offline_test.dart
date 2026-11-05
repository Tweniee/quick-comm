import 'package:flutter_test/flutter_test.dart';
import 'package:quick_delivery/core/api.dart';
import 'package:quick_delivery/core/offline_queue.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _OfflineApi extends Api {
  _OfflineApi() : super('test');
  bool online = false;
  final sent = <String>[];
  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    if (!online) throw ApiException(0, 'NETWORK', 'offline');
    sent.add(path);
    return {'ok': true};
  }
}

void main() {
  test('rupees formats paise', () {
    expect(rupees(3500), '₹35');
    expect(rupees(2850), '₹28.50');
    expect(rupees(null), '—');
  });

  test('offline actions queue with original time and replay in order', () async {
    SharedPreferences.setMockInitialValues({});
    final api = _OfflineApi();
    final q = OfflineQueue(api);
    expect(await q.send('/driver/orders/1/pickup', {}), isNull);
    expect(await q.send('/driver/orders/1/arrived', {}), isNull);
    expect(await q.length, 2);
    api.online = true;
    await q.flush();
    expect(api.sent, ['/driver/orders/1/pickup', '/driver/orders/1/arrived']);
    expect(await q.length, 0);
  });
}
