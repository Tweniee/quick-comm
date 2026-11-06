import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'home_screen.dart';
import 'strings.dart';

/// Phone + SMS OTP. Only drivers approved by support can log in (account is never immediately active).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.ctx, required this.onLanguage});
  final DriverCtx ctx;
  final Future<void> Function() onLanguage;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController();
  final code = TextEditingController();
  bool sent = false;
  bool busy = false;

  Future<void> _go() async {
    setState(() => busy = true);
    try {
      if (!sent) {
        final r = await widget.ctx.api.post('/auth/driver/request-otp', {'phone': phone.text});
        setState(() => sent = true);
        if (r['devOtp'] != null) code.text = r['devOtp'] as String; // dev only
      } else {
        final r = await widget.ctx.api.post('/auth/driver/verify-otp', {'phone': phone.text, 'code': code.text});
        await widget.ctx.api.setToken(r['token'] as String);
        if (!mounted) return;
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(ctx: widget.ctx, onLanguage: widget.onLanguage)));
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(S.t('appTitle')), actions: [TextButton(onPressed: () async { await widget.onLanguage(); setState(() {}); }, child: Text(S.t('language')))]),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        TextField(controller: phone, keyboardType: TextInputType.phone, style: const TextStyle(fontSize: 22), decoration: InputDecoration(labelText: S.t('phone'))),
        if (sent) ...[
          const SizedBox(height: 16),
          TextField(controller: code, keyboardType: TextInputType.number, style: const TextStyle(fontSize: 26, letterSpacing: 6), decoration: InputDecoration(labelText: S.t('enterOtp'))),
        ],
        const SizedBox(height: 24),
        ElevatedButton(onPressed: busy ? null : _go, child: Text(sent ? S.t('login') : S.t('getOtp'))),
      ]),
    );
  }
}
