import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'business_app.dart';

String _when(String iso) {
  final d = DateTime.parse(iso).toLocal();
  final n = DateTime.now();
  if (d.year == n.year && d.month == n.month && d.day == n.day) return clock(iso);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]}, ${clock(iso)}';
}

/// B15 · Wallet and passbook.
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key, this.standalone = false});
  final bool standalone;
  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  Map<String, dynamic>? w;
  List rows = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([bizApi.get('/business/wallet'), bizApi.get('/business/wallet/passbook?take=200')]);
      if (mounted) {
        setState(() {
          w = r[0] as Map<String, dynamic>;
          rows = r[1] as List;
        });
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final held = (w?['held'] as num?) ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet'), automaticallyImplyLeading: widget.standalone),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: Tw.navy, borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Balance · shared by all branches', style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13)),
              const SizedBox(height: 4),
              Text(rupees(w?['available'] as num?), style: Tw.display(40, color: Colors.white)),
              if (held > 0) Text('${rupees(held)} held for orders with a rider · ${rupees(w?['balance'] as num?)} total', style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13)),
              const SizedBox(height: 14),
              ElevatedButton(
                onPressed: () async {
                  await push(context, const RechargeScreen());
                  _load();
                },
                child: const Text('Recharge'),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          Text('We warn you at ₹200 and block new orders below ${rupees(w?['requiredToCreate'] as num?)}, the most one order can cost.', style: const TextStyle(color: Tw.muted, fontSize: 13)),
          const SizedBox(height: 18),
          Text('Passbook', style: Tw.display(18)),
          const SizedBox(height: 8),
          if (w != null && rows.isEmpty) const Notice('No entries yet. Your first recharge shows here.'),
          for (final r in rows)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Tw.line)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('${ledgerLabel[r['type']] ?? r['type']}${r['order']?['code'] != null ? ' · ${r['order']['code']}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700))),
                  Text(
                    ledgerAmount(r['type'] as String, r['amount'] as num),
                    style: TextStyle(fontWeight: FontWeight.w800, color: ledgerSign(r['type'] as String) > 0 ? Tw.ok : ledgerSign(r['type'] as String) < 0 ? Tw.bad : Tw.muted),
                  ),
                ]),
                const SizedBox(height: 4),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: Text('${_when(r['createdAt'] as String)} · ${r['reason']}', style: const TextStyle(color: Tw.muted, fontSize: 13))),
                  const SizedBox(width: 8),
                  Text(rupees(r['balanceAfter'] as num), style: const TextStyle(color: Tw.muted, fontSize: 13)),
                ]),
              ]),
            ),
          const SizedBox(height: 8),
          TextButton(onPressed: () => openWeb('/business/wallet'), child: const Text('Export passbook (CSV) on the web')),
        ]),
      ),
    );
  }
}

/// B16 · Recharge. Razorpay's own sheet shows UPI, net banking and cards; in the app it opens on the web portal.
class RechargeScreen extends StatefulWidget {
  const RechargeScreen({super.key});
  @override
  State<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends State<RechargeScreen> {
  Map<String, dynamic>? w;
  int amount = 1000;
  final ctl = TextEditingController(text: '1000');
  bool busy = false;

  @override
  void initState() {
    super.initState();
    bizApi.get('/business/wallet').then((v) {
      if (mounted) setState(() => w = v as Map<String, dynamic>);
    }).catchError((_) {});
  }

  Future<void> _pay() async {
    setState(() => busy = true);
    try {
      final r = await bizApi.post('/business/wallet/recharges', {'amount': amount * 100});
      if (r['provider'] == 'mock') {
        if (!mounted) return;
        final ok = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            content: Text('Test mode: simulate a successful payment of ₹$amount?'),
            actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('No')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Pay'))],
          ),
        );
        if (ok != true) return;
        await bizApi.post('/business/wallet/recharges/${r['rechargeId']}/mock-pay');
        if (mounted) {
          toast(context, 'Recharged ${rupees(amount * 100)}');
          Navigator.of(context).pop();
        }
      } else {
        await launchUrl(Uri.parse('$kWebUrl/business/wallet/recharge'), mode: LaunchMode.externalApplication);
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final min = ((w?['minRecharge'] as num?) ?? 50000) ~/ 100;
    final per = ((w?['deliveryFee'] as num?) ?? 3500) / 100;
    return Scaffold(
      appBar: AppBar(title: const Text('Recharge wallet')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          controller: ctl,
          keyboardType: TextInputType.number,
          style: Tw.display(28),
          decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ '),
          onChanged: (v) => setState(() => amount = int.tryParse(v) ?? 0),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 6, children: [
          for (final v in [500, 1000, 2000, 5000])
            ChoiceChip(
              label: Text('₹$v'),
              selected: amount == v,
              showCheckmark: false,
              selectedColor: Tw.navy,
              labelStyle: TextStyle(color: amount == v ? Colors.white : Tw.ink2, fontWeight: FontWeight.w600),
              onSelected: (_) => setState(() {
                amount = v;
                ctl.text = '$v';
              }),
            ),
        ]),
        const SizedBox(height: 8),
        Text('Minimum ₹$min. About ${per > 0 ? (amount / per).floor() : 0} deliveries at ₹${per.toStringAsFixed(0)}.', style: const TextStyle(color: Tw.muted)),
        const SizedBox(height: 16),
        const Notice('Pay by UPI, net banking or card. Wallet money pays only for deliveries. Refunds and corrections come back to the wallet and show in your passbook.'),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: busy || amount < min ? null : _pay, child: Text(busy ? 'Opening…' : 'Pay ${rupees(amount * 100)}')),
      ]),
    );
  }
}
