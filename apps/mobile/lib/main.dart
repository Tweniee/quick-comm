import 'package:flutter/material.dart';

import 'driver/driver_app.dart';

/// Driver (rider) app entry point:
///   flutter run -t lib/main_driver.dart --dart-define=API_URL=http://10.0.2.2:4000
void main() => runApp(const DriverApp());
