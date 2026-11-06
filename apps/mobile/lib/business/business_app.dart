import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';

final bizApi = Api('business');

class BusinessApp extends StatefulWidget {
  const BusinessApp({super.key});
  @override
  State<BusinessApp> createState() => _BusinessAppState();
}

class _BusinessAppState extends State<BusinessApp> {
  final navKey = GlobalKey<NavigatorState>();
  bool loading = true;

  @override
  void initState() {
    super.initState();
    bizApi.load().then((_) => setState(() => loading = false));
    bizApi.onUnauthorized = () => navKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const BizLogin()), (_) => false);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        navigatorKey: navKey,
        title: 'Tweniee Business',
        theme: appTheme(),
        home: loading ? const Scaffold(body: Center(child: CircularProgressIndicator())) : bizApi.isLoggedIn ? const BizHome() : const BizLogin(),
      );
}

class BizLogin extends StatefulWidget {
  const BizLogin({super.key});
  @override
  State<BizLogin> createState() => _BizLoginState();
}

class _BizLoginState extends State<BizLogin> {
  final login = TextEditingController();
  final pw = TextEditingController();
  bool busy = false;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Tweniee Business')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          TextField(controller: login, decoration: const InputDecoration(labelText: 'Phone or email')),
          const SizedBox(height: 12),
          TextField(controller: pw, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: busy ? null : () async {
              setState(() => busy = true);
              try {
                final r = await bizApi.post('/auth/business/login', {'login': login.text, 'password': pw.text});
                await bizApi.setToken(r['token'] as String);
                if (context.mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const BizHome()));
              } on ApiException catch (e) {
                if (context.mounted) toast(context, e.message, error: true);
              } finally {
                if (mounted) setState(() => busy = false);
              }
            },
            child: const Text('Log in'),
          ),
          const SizedBox(height: 12),
          const Text('New business? Sign up on the website to get verified.', textAlign: TextAlign.center),
        ]),
      );
}

/// Home: today's orders by status, wallet, live list. Status must be readable in 3 seconds.
class BizHome extends StatefulWidget {
  const BizHome({super.key});
  @override
  State<BizHome> createState() => _BizHomeState();
}

class _BizHomeState extends State<BizHome> {
  Map<String, dynamic>? wallet;
  Map<String, dynamic>? me;
  List orders = [];
  DateTime? updated;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _load();
    _t = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([bizApi.get('/business/wallet'), bizApi.get('/business/orders?take=50'), bizApi.get('/business/me')]);
      if (mounted) setState(() { wallet = r[0] as Map<String, dynamic>; orders = (r[1] as Map)['items'] as List; me = r[2] as Map<String, dynamic>; updated = DateTime.now(); });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final pending = me != null && me!['status'] != 'APPROVED';
    return Scaffold(
      appBar: AppBar(title: Text(me?['name'] as String? ?? 'Orders'), actions: [
        IconButton(icon: const Icon(Icons.account_balance_wallet), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BizWallet()))),
        IconButton(icon: const Icon(Icons.logout), onPressed: () async { await bizApi.setToken(null); if (context.mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const BizLogin())); }),
      ]),
      floatingActionButton: pending ? null : FloatingActionButton.extended(onPressed: () async { await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateOrder())); _load(); }, icon: const Icon(Icons.add), label: const Text('New order')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(12), children: [
          if (pending) Card(color: Colors.amber.shade100, child: ListTile(title: Text('Verification ${me!['status']}'), subtitle: Text(me!['statusReason'] as String? ?? 'Upload your documents on the website. Orders open after approval.'))),
          Card(child: ListTile(
            title: Text('Wallet ${rupees(wallet?['available'] as num?)}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            subtitle: Text(wallet?['lowBalance'] == true ? 'Low balance, recharge to keep creating orders' : '${rupees(wallet?['deliveryFee'] as num?)} per delivery · ${rupees(wallet?['returnFee'] as num?)} extra if returned'),
          )),
          if (updated != null) Padding(padding: const EdgeInsets.all(4), child: Text('Last updated ${TimeOfDay.fromDateTime(updated!).format(context)}', style: const TextStyle(color: Colors.black54))),
          for (final o in orders)
            Card(child: ListTile(
              title: Text('${o['customer']['name']} · ${o['code']}'),
              subtitle: Text('${o['parcel']['description']}${o['rider'] != null ? ' · Rider ${o['rider']['firstName']}' : ''}'),
              trailing: StatusChip(o['status'] as String),
              onTap: () async { await Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderDetail(id: o['id'] as String))); _load(); },
            )),
          const SizedBox(height: 80),
        ]),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    final c = switch (status) {
      'DELIVERED' => Colors.green,
      'NO_RIDER' || 'RETURNING' || 'UNDELIVERED' => Colors.orange,
      'CANCELLED' || 'RETURNED' => Colors.red,
      'CREATED' || 'READY' || 'ASSIGNING' => Colors.grey,
      _ => Colors.blue,
    };
    return Chip(label: Text(statusLabel[status] ?? status, style: const TextStyle(color: Colors.white)), backgroundColor: c);
  }
}

/// Six-field order form; fee shown before the button (masterplan §13).
class CreateOrder extends StatefulWidget {
  const CreateOrder({super.key});
  @override
  State<CreateOrder> createState() => _CreateOrderState();
}

class _CreateOrderState extends State<CreateOrder> {
  final c = {for (final k in ['phone', 'name', 'address', 'landmark', 'pincode', 'desc', 'kg', 'value', 'pin']) k: TextEditingController()};
  Map<String, dynamic>? quote;
  List addresses = [];
  String? pickupId;
  bool fragile = false;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    c['kg']!.text = '1';
    bizApi.get('/business/orders/quote').then((q) => setState(() => quote = q as Map<String, dynamic>)).catchError((_) {});
    bizApi.get('/business/me').then((m) => setState(() {
          addresses = (m as Map)['addresses'] as List;
          pickupId = (addresses.firstWhere((a) => a['isDefault'] == true, orElse: () => addresses.isEmpty ? null : addresses.first))?['id'] as String?;
        })).catchError((_) {});
  }

  (double, double)? _pin() {
    final m = RegExp(r'(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)').firstMatch(c['pin']!.text) ?? RegExp(r'@(-?\d+\.\d+),(-?\d+\.\d+)').firstMatch(c['pin']!.text);
    return m == null ? null : (double.parse(m.group(1)!), double.parse(m.group(2)!));
  }

  Future<void> _submit(bool ready) async {
    final pin = _pin();
    if (pin == null) { toast(context, 'Set the delivery location pin', error: true); return; }
    setState(() => busy = true);
    try {
      final o = await bizApi.post('/business/orders', {
        'pickupAddressId': pickupId, 'customerPhone': c['phone']!.text, 'customerName': c['name']!.text,
        'dropAddress': c['address']!.text, 'dropLandmark': c['landmark']!.text, 'dropPincode': c['pincode']!.text, 'dropLat': pin.$1, 'dropLng': pin.$2,
        'parcelDescription': c['desc']!.text, 'weightGrams': ((double.tryParse(c['kg']!.text) ?? 0) * 1000).round(),
        'declaredValue': ((double.tryParse(c['value']!.text) ?? 0) * 100).round(), 'isFragile': fragile, 'markReady': ready,
      });
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => OrderDetail(id: o['id'] as String)));
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _f(String k, String label, {TextInputType? type, String? hint}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(controller: c[k], keyboardType: type, decoration: InputDecoration(labelText: label, helperText: hint)),
      );

  @override
  Widget build(BuildContext context) {
    final canCreate = quote?['canCreate'] != false;
    return Scaffold(
      appBar: AppBar(title: const Text('New order')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _f('phone', 'Customer phone', type: TextInputType.phone, hint: 'OTP and tracking link go here. Wrong number = ₹60 return.'),
        _f('name', 'Customer name'),
        _f('address', 'Delivery address'),
        _f('landmark', 'Landmark'),
        _f('pincode', 'Pincode', type: TextInputType.number),
        Row(children: [
          Expanded(child: _f('pin', 'Location pin (lat, lng or Maps link)')),
          IconButton(icon: const Icon(Icons.my_location), onPressed: () async {
            final p = await Geolocator.getCurrentPosition();
            c['pin']!.text = '${p.latitude.toStringAsFixed(6)}, ${p.longitude.toStringAsFixed(6)}';
          }),
        ]),
        _f('desc', 'What is it?'),
        _f('kg', 'Weight (kg, max 20)', type: TextInputType.number),
        _f('value', 'Parcel value (₹)', type: TextInputType.number, hint: 'Liability capped at the lower of value or ₹5,000'),
        if (addresses.length > 1)
          DropdownButtonFormField<String>(initialValue: pickupId, decoration: const InputDecoration(labelText: 'Pickup from'), items: [for (final a in addresses) DropdownMenuItem(value: a['id'] as String, child: Text('${a['label']}'))], onChanged: (v) => setState(() => pickupId = v)),
        SwitchListTile(value: fragile, onChanged: (v) => setState(() => fragile = v), title: const Text('Fragile')),
        Card(child: ListTile(
          title: Text('Delivery fee ${rupees(quote?['deliveryFee'] as num?)}'),
          subtitle: Text(quote?['message'] as String? ?? '${rupees(quote?['undeliveredTotal'] as num?)} held when a rider accepts; ${rupees(quote?['returnFee'] as num?)} comes back once delivered. Wallet ${rupees(quote?['walletAvailable'] as num?)}.'),
        )),
        const SizedBox(height: 8),
        ElevatedButton(onPressed: busy || !canCreate ? null : () => _submit(true), child: const Text('Create & mark Ready')),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: busy || !canCreate ? null : () => _submit(false), child: const Text('Save, not packed yet')),
      ]),
    );
  }
}

class OrderDetail extends StatefulWidget {
  const OrderDetail({super.key, required this.id});
  final String id;
  @override
  State<OrderDetail> createState() => _OrderDetailState();
}

class _OrderDetailState extends State<OrderDetail> {
  Map<String, dynamic>? o;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _load();
    _t = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await bizApi.get('/business/orders/${widget.id}');
      if (mounted) setState(() => o = r as Map<String, dynamic>);
    } catch (_) {}
  }

  Future<void> _act(String path, [Map<String, dynamic> body = const {}]) async {
    try { await bizApi.post('/business/orders/${widget.id}/$path', body); await _load(); } on ApiException catch (e) { if (mounted) toast(context, e.message, error: true); }
  }

  @override
  Widget build(BuildContext context) {
    if (o == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final s = o!['status'] as String;
    final rider = o!['rider'] as Map<String, dynamic>?;
    return Scaffold(
      appBar: AppBar(title: Text(o!['code'] as String)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Align(alignment: Alignment.centerLeft, child: StatusChip(s)),
          if (s == 'NO_RIDER') Card(color: Colors.orange.shade50, child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [
            const Text('No rider available at this moment in your area. Please retry in 10 minutes. You have not been charged.'),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: () => _act('retry-assignment'), child: const Text('Retry')),
          ]))),
          if (s == 'RETURNING' && o!['returnOtp'] != null) Card(color: Colors.orange.shade50, child: ListTile(
            title: Text('Return code: ${o!['returnOtp']}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
            subtitle: Text('Parcel coming back (${o!['undeliveredReason']}). Give this code to the rider when you receive it.'),
          )),
          if (s == 'CREATED') ElevatedButton(onPressed: () => _act('ready'), child: const Text('Mark Ready (packed & sealed)')),
          if (['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER'].contains(s)) OutlinedButton(onPressed: () => _act('cancel'), child: const Text('Cancel (no charge)')),
          if (s == 'ASSIGNED') OutlinedButton(onPressed: () => _act('request-cancellation', {'note': 'Requested from app'}), child: const Text('Request cancellation')),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            icon: const Icon(Icons.share),
            label: const Text('Share tracking on WhatsApp'),
            onPressed: () => launchUrl(Uri.parse('https://wa.me/91${o!['customer']['phone']}?text=${Uri.encodeComponent('Track your parcel: ${o!['trackingUrl']}')}'), mode: LaunchMode.externalApplication),
          ),
          ListTile(title: const Text('Customer'), subtitle: Text('${o!['customer']['name']} · ${o!['customer']['phone']}\n${o!['customer']['address']}')),
          ListTile(title: const Text('Rider'), subtitle: Text(rider == null ? 'Not assigned' : '${rider['firstName']} · ${rider['phoneMasked']} · ${rider['vehicleNumber'] ?? ''}')),
          ListTile(title: const Text('OTP'), subtitle: Text(o!['otp']['status'] == 'SENT' ? 'Sent to customer' : 'Not sent yet')),
          ListTile(title: const Text('Fees'), subtitle: Text('${rupees(o!['fees']['delivery'] as num)} delivery${['UNDELIVERED', 'RETURNING', 'RETURNED'].contains(s) ? ' + ${rupees(o!['fees']['return'] as num)} return' : ''}')),
          const Divider(),
          for (final t in (o!['timeline'] as List))
            ListTile(dense: true, leading: const Icon(Icons.circle, size: 12, color: brand), title: Text(t['label'] as String), subtitle: Text('${(t['at'] as String).substring(11, 16)} · ${t['actorType']}${t['reason'] != null ? '\n${t['reason']}' : ''}')),
        ]),
      ),
    );
  }
}

class BizWallet extends StatefulWidget {
  const BizWallet({super.key});
  @override
  State<BizWallet> createState() => _BizWalletState();
}

class _BizWalletState extends State<BizWallet> {
  Map<String, dynamic>? w;
  List rows = [];
  final amount = TextEditingController(text: '1000');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait([bizApi.get('/business/wallet'), bizApi.get('/business/wallet/passbook?take=100')]);
    if (mounted) setState(() { w = r[0] as Map<String, dynamic>; rows = r[1] as List; });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Wallet')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Available ${rupees(w?['available'] as num?)}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          Text('Held for assigned orders: ${rupees(w?['held'] as num?)}'),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Recharge ₹'))),
            const SizedBox(width: 8),
            ElevatedButton(
              style: ElevatedButton.styleFrom(minimumSize: const Size(120, 56)),
              onPressed: () async {
                try {
                  final r = await bizApi.post('/business/wallet/recharges', {'amount': ((double.tryParse(amount.text) ?? 0) * 100).round()});
                  if (r['provider'] == 'mock') {
                    await bizApi.post('/business/wallet/recharges/${r['rechargeId']}/mock-pay');
                    if (context.mounted) toast(context, 'Recharged (development payment)');
                  } else {
                    // Razorpay checkout runs on the web portal; open it.
                    await launchUrl(Uri.parse('${kApiUrl.replaceFirst(':4000', ':3000')}/business/wallet'), mode: LaunchMode.externalApplication);
                  }
                  await _load();
                } on ApiException catch (e) {
                  if (context.mounted) toast(context, e.message, error: true);
                }
              },
              child: const Text('Recharge'),
            ),
          ]),
          const Divider(height: 32),
          for (final r in rows)
            ListTile(
              dense: true,
              title: Text('${r['type']} ${rupees(r['amount'] as num)}'),
              subtitle: Text('${r['reason']}\n${(r['createdAt'] as String).substring(0, 16).replaceFirst('T', ' ')}'),
              trailing: Text(rupees(r['balanceAfter'] as num)),
            ),
        ]),
      );
}
