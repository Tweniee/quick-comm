import 'package:flutter/material.dart';

import 'business/business_app.dart';

/// Business app entry point:
///   flutter run -t lib/main_business.dart --dart-define=API_URL=http://10.0.2.2:4000
void main() => runApp(const BusinessApp());
