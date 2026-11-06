import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'strings.dart';

/// D13 · Earnings & payouts. This week's breakdown, then past weekly payouts.
class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key, required this.ctx});
  final DriverCtx ctx;
  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  Map<String, dynamic>? e;

  @override
  void initState() {
    super.initState();
    widget.ctx.api.get('/driver/earnings').then((v) {
      if (mounted) setState(() => e = v as Map<String, dynamic>);
    }).catchError((Object err) {
      if (mounted) toast(context, err.toString(), error: true);
    });
  }

  Widget _row(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 15, color: bold ? Tw.ink : Tw.ink2, fontWeight: bold ? FontWeight.w700 : FontWeight.w400))),
          Text(value, style: TextStyle(fontSize: 15, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: Tw.ink)),
        ]),
      );

  String _weekLabel(String iso) {
    final d = DateTime.parse(iso).toLocal();
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final end = d.add(const Duration(days: 6));
    return '${d.day} ${m[d.month - 1]} – ${end.day} ${m[end.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final w = e?['week'] as Map<String, dynamic>?;
    return Scaffold(
      appBar: AppBar(title: Text(S.t('earnings'))),
      body: e == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(20), children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Tw.navy, borderRadius: BorderRadius.circular(16)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(S.l('This week', 'इस हफ्ते'), style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 14)),
                  const SizedBox(height: 4),
                  Text(rupees(e!['thisWeek']['amount'] as num), style: Tw.display(36, color: Colors.white)),
                  const SizedBox(height: 4),
                  Text(S.l('Paid every Monday', 'हर सोमवार भुगतान'), style: const TextStyle(color: Color(0xFF5EEAD4), fontWeight: FontWeight.w600)),
                ]),
              ),
              const SizedBox(height: 12),
              Row(children: [
                StatTile(label: S.t('today'), value: rupees(e!['today']['amount'] as num)),
                const SizedBox(width: 10),
                StatTile(label: S.t('unpaid'), value: rupees(e!['unpaid'] as num)),
              ]),
              const SizedBox(height: 12),
              LabeledCard(label: S.l('This week', 'इस हफ्ते'), children: [
                _row(S.l('Deliveries · ${w?['deliveries'] ?? 0}', 'डिलीवरी · ${w?['deliveries'] ?? 0}'), rupees(w?['deliveryAmount'] as num? ?? 0)),
                _row(S.l('Returns · ${w?['returns'] ?? 0}', 'वापसी · ${w?['returns'] ?? 0}'), rupees(w?['returnAmount'] as num? ?? 0)),
                _row(S.l('Adjustments', 'समायोजन'), rupees(w?['adjustments'] as num? ?? 0)),
                const Divider(height: 16),
                _row(S.l('Total', 'कुल'), rupees(e!['thisWeek']['amount'] as num), bold: true),
                if (e!['bank'] != null) ...[
                  const SizedBox(height: 6),
                  Text('${S.l('Goes to bank', 'बैंक में जाएगा')} ${e!['bank']}', style: const TextStyle(color: Tw.muted)),
                ],
              ]),
              const SizedBox(height: 20),
              Text(S.l('PAST PAYOUTS', 'पिछले भुगतान'), style: const TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: Tw.muted)),
              const SizedBox(height: 8),
              if ((e!['payouts'] as List).isEmpty)
                Notice(S.l('No payouts yet. Your first one comes the Monday after your first delivery.', 'अभी कोई भुगतान नहीं। पहली डिलीवरी के बाद वाले सोमवार को मिलेगा।')),
              for (final p in (e!['payouts'] as List))
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(_weekLabel(p['weekStart'] as String), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      if (p['reference'] != null) Text('UTR ${p['reference']}', style: const TextStyle(color: Tw.muted, fontSize: 13)),
                    ])),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(rupees(p['netPay'] as num), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 4),
                      StatusChip(p['status'] == 'PAID' ? 'DELIVERED' : 'PICKED_UP', label: p['status'] == 'PAID' ? S.l('Paid', 'भुगतान हुआ') : S.l('Pending', 'बाकी')),
                    ]),
                  ]),
                ),
            ]),
    );
  }
}
