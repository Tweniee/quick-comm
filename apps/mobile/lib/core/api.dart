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

  /// Multipart upload (document renewals). [fields] go as form fields, the file as `file`.
  Future<dynamic> upload(String path, Map<String, String> fields, String filePath) async {
    final req = http.MultipartRequest('POST', Uri.parse('$kApiUrl/api$path'))..fields.addAll(fields);
    if (_token != null) req.headers['Authorization'] = 'Bearer $_token';
    req.files.add(await http.MultipartFile.fromPath('file', filePath));
    http.Response res;
    try {
      res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 60)));
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'No network. Try again.');
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final e = (data is Map ? data['error'] : null) as Map<String, dynamic>? ?? {};
      throw ApiException(res.statusCode, e['code'] as String? ?? 'ERROR', e['message'] as String? ?? 'Upload failed');
    }
    return data;
  }

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

/// Tweniee partner support line. Set at build time: --dart-define=SUPPORT_PHONE=+91XXXXXXXXXX
const String kSupportPhone = String.fromEnvironment('SUPPORT_PHONE', defaultValue: '');

/// "3:41 pm"
String clock(String? iso) {
  if (iso == null) return '—';
  final d = DateTime.parse(iso).toLocal();
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'am' : 'pm'}';
}

/// "11:42"
String mmss(Duration d) {
  final s = d.inSeconds.clamp(0, 359999);
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}
