import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';
import '../core/location.dart';
import '../core/offline_queue.dart';
import '../core/theme.dart';
import 'home_screen.dart';
import 'login_screen.dart';
import 'strings.dart';

/// Shared services for the Driver App.
class DriverCtx {
  DriverCtx() : api = Api('driver') {
    queue = OfflineQueue(api);
  }
  final Api api;
  late final OfflineQueue queue;
  final location = LocationService();
}

class DriverApp extends StatefulWidget {
  const DriverApp({super.key});
  @override
  State<DriverApp> createState() => _DriverAppState();
}

class _DriverAppState extends State<DriverApp> {
  final ctx = DriverCtx();
  final navKey = GlobalKey<NavigatorState>();
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await ctx.api.load();
    final p = await SharedPreferences.getInstance();
    S.lang = p.getString('qd.driver.lang') ?? 'hi';
    ctx.api.onUnauthorized = () => navKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => LoginScreen(ctx: ctx, onLanguage: _setLang)), (_) => false);
    setState(() => loading = false);
  }

  Future<void> _setLang(String lang) async {
    if (lang == S.lang) return;
    S.lang = lang;
    final p = await SharedPreferences.getInstance();
    await p.setString('qd.driver.lang', S.lang);
    if (ctx.api.isLoggedIn) {
      try { await ctx.api.post('/driver/language', {'language': S.lang}); } catch (_) {}
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navKey,
      title: 'Tweniee Partner',
      debugShowCheckedModeBanner: false,
      theme: appTheme(),
      home: loading
          ? const Scaffold(backgroundColor: Tw.navy, body: Center(child: TwLogo(size: 56)))
          : ctx.api.isLoggedIn
              ? HomeScreen(ctx: ctx, onLanguage: _setLang)
              : LoginScreen(ctx: ctx, onLanguage: _setLang),
    );
  }
}
