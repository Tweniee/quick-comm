import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Backend base URL. Override at build time:
///   flutter run -t lib/main_driver.dart --dart-define=API_URL=https://api.example.com
/// Android emulator reaches the host machine at 10.0.2.2.
const String kApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');

class ApiException implements Exception {
  ApiException(this.status, this.code, this.message, {this.nextAction, this.details});
  final int status;
  final String code;
  final String message;
  final String? nextAction;
  final Map<String, dynamic>? details;
  bool get isNetwork => status == 0;
  @override
  String toString() => message;
}

/// Thin JSON client. One instance per app ("driver" or "business"), token kept in shared preferences.
class Api {
  Api(this.scope);
  final String scope;
  String? _token;
  void Function()? onUnauthorized;

  String get _key => 'qd.$scope.token';
  bool get isLoggedIn => _token != null;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _token = p.getString(_key);
  }

  Future<void> setToken(String? t) async {
    _token = t;
    final p = await SharedPreferences.getInstance();
    if (t == null) {
      await p.remove(_key);
    } else {
      await p.setString(_key, t);
    }
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body ?? {});

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('$kApiUrl/api$path');
    final headers = {
      'Content-Type': 'application/json',
      if (_token != null) 'Authorization': 'Bearer $_token',
    };
    http.Response res;
    try {
      res = method == 'GET'
          ? await http.get(uri, headers: headers).timeout(const Duration(seconds: 15))
          : await http.post(uri, headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds: 15));
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'No network. Will retry.');
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode == 401) {
      await setToken(null);
      onUnauthorized?.call();
    }
    if (res.statusCode >= 400) {
      final e = (data is Map ? data['error'] : null) as Map<String, dynamic>? ?? {};
      throw ApiException(res.statusCode, e['code'] as String? ?? 'ERROR', e['message'] as String? ?? 'Something went wrong',
          nextAction: e['nextAction'] as String?, details: e['details'] as Map<String, dynamic>?);
    }
    return data;
  }
}

String rupees(num? paise) {
  if (paise == null) return '—';
  final r = paise / 100;
  return '₹${r == r.roundToDouble() ? r.toStringAsFixed(0) : r.toStringAsFixed(2)}';
}

const statusLabel = {
  'CREATED': 'Created', 'READY': 'Ready', 'ASSIGNING': 'Assigning', 'NO_RIDER': 'No Rider', 'ASSIGNED': 'Assigned',
  'PICKED_UP': 'Picked Up', 'OUT_FOR_DELIVERY': 'Out for Delivery', 'ARRIVED': 'Arrived', 'DELIVERED': 'Delivered',
  'UNDELIVERED': 'Undelivered', 'RETURNING': 'Returning', 'RETURNED': 'Returned', 'CANCELLED': 'Cancelled',
};
