import 'package:flutter/material.dart';

const brand = Color(0xFF0B6E4F);

/// High contrast, large tap targets: usable in sunlight, rain, with gloves (masterplan §4.3, §13).
ThemeData appTheme() {
  final base = ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: brand), useMaterial3: true);
  return base.copyWith(
    textTheme: base.textTheme.apply(fontSizeFactor: 1.1),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(60),
        backgroundColor: brand,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
  );
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? Colors.red.shade700 : null));
}
