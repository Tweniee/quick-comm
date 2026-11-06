import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'home_screen.dart';
import 'strings.dart';

/// D01 · Phone + SMS OTP. Only drivers approved by support can log in.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.ctx, required this.onLanguage});
  final DriverCtx ctx;
  final Future<void> Function(String) onLanguage;
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
      backgroundColor: Tw.navy,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          Align(alignment: Alignment.centerRight, child: LangToggle(lang: S.lang, onChanged: (l) async { await widget.onLanguage(l); setState(() {}); })),
          const SizedBox(height: 40),
          const TwLogo(size: 56),
          const SizedBox(height: 16),
          Text('Tweniee Partner', style: Tw.display(30, color: Colors.white)),
          const SizedBox(height: 6),
          Text(S.l('Deliver for local shops. One order at a time.', 'लोकल दुकानों के लिए डिलीवरी। एक बार में एक ऑर्डर।'), style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 16)),
          const SizedBox(height: 32),
          Text(S.t('phone'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(controller: phone, keyboardType: TextInputType.phone, style: const TextStyle(fontSize: 22), decoration: const InputDecoration(prefixText: '+91  ')),
          if (sent) ...[
            const SizedBox(height: 16),
            const Text('OTP', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6, style: const TextStyle(fontSize: 26, letterSpacing: 8), decoration: const InputDecoration(counterText: '')),
          ],
          const SizedBox(height: 24),
          ElevatedButton(onPressed: busy ? null : _go, child: Text(sent ? S.t('login') : S.t('getOtp'))),
          const SizedBox(height: 16),
          Text(S.l('Only partners approved by Tweniee support can log in.', 'सिर्फ Tweniee सपोर्ट से मंज़ूर पार्टनर लॉग इन कर सकते हैं।'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF94A3B8))),
        ]),
      ),
    );
  }
}
