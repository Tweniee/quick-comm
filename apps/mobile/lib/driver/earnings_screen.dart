import 'package:flutter/material.dart';

import '../core/api.dart';
import 'driver_app.dart';
import 'strings.dart';

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
    widget.ctx.api.get('/driver/earnings').then((v) => setState(() => e = v as Map<String, dynamic>)).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(S.t('earnings'))),
      body: e == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              ListTile(title: Text(S.t('today')), trailing: Text(rupees(e!['today']['amount'] as num), style: const TextStyle(fontSize: 20))),
              ListTile(title: Text(S.t('thisWeek')), trailing: Text(rupees(e!['thisWeek']['amount'] as num), style: const TextStyle(fontSize: 20))),
              ListTile(title: Text(S.t('unpaid')), trailing: Text(rupees(e!['unpaid'] as num), style: const TextStyle(fontSize: 20))),
              const Divider(),
              for (final r in (e!['recent'] as List))
                ListTile(dense: true, title: Text('${r['orderCode'] ?? ''} · ${r['leg']}'), subtitle: Text((r['createdAt'] as String).substring(0, 16).replaceFirst('T', ' ')), trailing: Text(rupees(r['amount'] as num))),
              const Divider(),
              for (final p in (e!['payouts'] as List))
                ListTile(title: Text('Week of ${(p['weekStart'] as String).substring(0, 10)}'), subtitle: Text('${p['status']} ${p['reference'] ?? ''}'), trailing: Text(rupees(p['netPay'] as num))),
            ]),
    );
  }
}
