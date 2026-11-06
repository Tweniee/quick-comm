import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'strings.dart';

/// D16 · Help. Call support, or report a problem on the live order.
/// Refusing a parcel is only possible before pickup (ASSIGNED); after that the issue goes to support.
class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key, required this.ctx, this.job, this.onChanged});
  final DriverCtx ctx;
  final Map<String, dynamic>? job;
  final Future<void> Function()? onChanged;
  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  bool busy = false;

  String? get orderId => widget.job?['id'] as String?;
  String? get status => widget.job?['status'] as String?;
  bool get beforePickup => status == 'ASSIGNED';

  Future<void> _callSupport() async {
    if (kSupportPhone.isEmpty) {
      toast(context, S.l('Support number not set in this build', 'इस ऐप में सपोर्ट नंबर सेट नहीं है'), error: true);
      return;
    }
    await launchUrl(Uri.parse('tel:$kSupportPhone'));
  }

  Future<void> _report({String? refuse, required String message}) async {
    if (orderId == null) return;
    setState(() => busy = true);
    try {
      if (refuse != null) {
        await widget.ctx.location.current();
        await widget.ctx.queue.send('/driver/orders/$orderId/refuse-pickup', {'reason': refuse, ...widget.ctx.location.stamp()});
      } else {
        await widget.ctx.api.post('/driver/orders/$orderId/help', {'message': message});
      }
      await widget.onChanged?.call();
      if (!mounted) return;
      toast(context, refuse != null ? S.l('Parcel refused. Support informed.', 'पार्सल मना किया। सपोर्ट को बता दिया।') : S.l('Support informed. They will call you.', 'सपोर्ट को बता दिया। वे आपको कॉल करेंगे।'));
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _problem(String en, String hi, {String? refuse}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft, padding: const EdgeInsets.symmetric(horizontal: 16)),
          onPressed: busy ? null : () => _report(refuse: refuse, message: en),
          child: Text(S.l(en, hi)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(S.t('help'))),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Text(S.l('Need help?', 'मदद चाहिए?'), style: Tw.display(26)),
          const SizedBox(height: 6),
          Text(S.l('Support answers 8 am to 11 pm.', 'सपोर्ट सुबह 8 से रात 11 बजे तक।'), style: const TextStyle(color: Tw.muted, fontSize: 15)),
          const SizedBox(height: 20),
          ElevatedButton.icon(onPressed: _callSupport, icon: const Icon(Icons.call), label: Text(S.l('Call support', 'सपोर्ट को कॉल करें'))),
          const SizedBox(height: 24),
          if (orderId != null) ...[
            Text(S.l('Report a problem on order ${widget.job?['code'] ?? ''}', 'ऑर्डर ${widget.job?['code'] ?? ''} में समस्या बताएं').toUpperCase(),
                style: const TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: Tw.muted)),
            const SizedBox(height: 10),
            if (beforePickup) ...[
              _problem('Parcel looks suspicious', 'पार्सल संदिग्ध लगता है', refuse: 'SUSPICIOUS'),
              _problem('Parcel too big for bike', 'पार्सल बाइक के लिए बड़ा है', refuse: 'OVERSIZE'),
              _problem('Shop not ready', 'दुकान तैयार नहीं', refuse: 'NOT_READY'),
            ],
            _problem('OTP is not working', 'OTP काम नहीं कर रहा'),
            _problem('Bike breakdown', 'बाइक खराब हो गई'),
            _problem('Accident or safety issue', 'दुर्घटना या सुरक्षा समस्या'),
            const SizedBox(height: 8),
            Notice(beforePickup
                ? S.l('Refusing before pickup costs you nothing. The shop is told why.', 'पिकअप से पहले मना करने पर कोई कटौती नहीं। दुकान को कारण बताया जाएगा।')
                : S.l('Keep the parcel safe. Support will call you back.', 'पार्सल सुरक्षित रखें। सपोर्ट आपको वापस कॉल करेगा।')),
          ] else
            Notice(S.l('No live order. For payouts or documents, call support.', 'कोई चालू ऑर्डर नहीं। भुगतान या दस्तावेज़ के लिए सपोर्ट को कॉल करें।')),
        ]),
      ),
    );
  }
}
