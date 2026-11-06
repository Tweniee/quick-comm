import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// Battery-light location: one fix every [interval] while online, never in the background when offline.
class LocationService {
  Position? last;
  Timer? _timer;

  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  Future<Position?> current() async {
    try {
      last = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)));
    } catch (_) {
      // keep last known
    }
    return last;
  }

  Map<String, dynamic> stamp() => last == null ? {} : {'lat': last!.latitude, 'lng': last!.longitude};

  void start(Duration interval, Future<void> Function(Position p) onFix) {
    stop();
    _timer = Timer.periodic(interval, (_) async {
      final p = await current();
      if (p != null) await onFix(p);
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
