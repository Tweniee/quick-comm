import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'business_app.dart';
import 'wallet_screens.dart';

/// B07 · Create order, with B08 (low balance) in place of the fee box when the wallet is short.
class CreateOrder extends StatefulWidget {
  const CreateOrder({super.key});
  @override
  State<CreateOrder> createState() => _CreateOrderState();
}

class _CreateOrderState extends State<CreateOrder> {
  final c = {for (final k in ['phone', 'name', 'address', 'landmark', 'pincode', 'desc', 'kg', 'value', 'pin', 'note', 'ref']) k: TextEditingController()};
  Map<String, dynamic>? quote;
  List addresses = [];
  String? pickupId;
  bool fragile = false;
  bool showNote = false;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    c['kg']!.text = '1';
    _quote();
    bizApi.get('/business/me').then((m) {
      if (!mounted) return;
      setState(() {
        addresses = (m as Map)['addresses'] as List;
        final def = addresses.where((a) => a['isDefault'] == true).firstOrNull ?? addresses.firstOrNull;
        pickupId = def?['id'] as String?;
      });
    }).catchError((_) {});
  }

  Future<void> _quote() async {
    try {
      final q = await bizApi.get('/business/orders/quote');
      if (mounted) setState(() => quote = q as Map<String, dynamic>);
    } catch (_) {}
  }

  (double, double)? _pin() {
    final t = c['pin']!.text;
    final m = RegExp(r'(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)').firstMatch(t) ?? RegExp(r'@(-?\d+\.\d+),(-?\d+\.\d+)').firstMatch(t);
    return m == null ? null : (double.parse(m.group(1)!), double.parse(m.group(2)!));
  }

  Future<void> _submit() async {
    final pin = _pin();
    if (pin == null) {
      toast(context, 'Set the delivery pin so the rider can navigate', error: true);
      return;
    }
    setState(() => busy = true);
    try {
      final o = await bizApi.post('/business/orders', {
        'pickupAddressId': pickupId, 'customerPhone': c['phone']!.text.trim(), 'customerName': c['name']!.text.trim(),
        'dropAddress': c['address']!.text.trim(), 'dropLandmark': c['landmark']!.text.trim(), 'dropPincode': c['pincode']!.text.trim(), 'dropLat': pin.$1, 'dropLng': pin.$2,
        'parcelDescription': c['desc']!.text.trim(), 'weightGrams': ((double.tryParse(c['kg']!.text) ?? 0) * 1000).round(),
        'declaredValue': ((double.tryParse(c['value']!.text) ?? 0) * 100).round(), 'isFragile': fragile, 'markReady': false,
        if (c['note']!.text.trim().isNotEmpty) 'specialInstructions': c['note']!.text.trim(),
        if (c['ref']!.text.trim().isNotEmpty) 'businessReferenceId': c['ref']!.text.trim(),
      });
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => OrderDetail(id: o['id'] as String)));
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _f(String k, String label, {TextInputType? type, String? hint, String? helper}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(controller: c[k], keyboardType: type, decoration: InputDecoration(labelText: label, hintText: hint, helperText: helper, helperMaxLines: 2)),
      );

  @override
  Widget build(BuildContext context) {
    final q = quote;
    final short = q != null && (q['walletAvailable'] as num) < (q['requiredAvailable'] as num);
    return Scaffold(
      appBar: AppBar(title: const Text('New delivery')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _f('phone', 'Customer phone', type: TextInputType.phone, hint: '10 digit mobile', helper: 'The OTP and tracking link go here. A wrong number means a ₹60 return.'),
        _f('name', 'Customer name'),
        _f('address', 'Delivery address', hint: 'House, street, area'),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(flex: 2, child: _f('landmark', 'Landmark', hint: 'Near…')),
          const SizedBox(width: 10),
          Expanded(child: _f('pincode', 'Pincode', type: TextInputType.number)),
        ]),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _f('pin', 'Delivery pin', hint: 'Paste a Maps link or lat, lng')),
          Padding(
            padding: const EdgeInsets.only(left: 6, top: 4),
            child: IconButton.filledTonal(
              tooltip: 'Use my location',
              icon: const Icon(Icons.my_location),
              onPressed: () async {
                try {
                  final p = await Geolocator.getCurrentPosition();
                  c['pin']!.text = '${p.latitude.toStringAsFixed(6)}, ${p.longitude.toStringAsFixed(6)}';
                } catch (_) {
                  if (context.mounted) toast(context, 'Location is off', error: true);
                }
              },
            ),
          ),
        ]),
        _f('desc', "What's in the parcel", hint: 'Kurta set, cake box…'),
        Row(children: [
          Expanded(child: _f('kg', 'Weight (kg)', type: const TextInputType.numberWithOptions(decimal: true))),
          const SizedBox(width: 10),
          Expanded(child: _f('value', 'Value (₹)', type: TextInputType.number)),
        ]),
        const Text('Max 20 kg, must fit a 45×35×35 cm bike box. Liability capped at ₹5,000.', style: TextStyle(color: Tw.muted, fontSize: 13)),
        const SizedBox(height: 12),
        if (addresses.length > 1) ...[
          const Text('PICKUP FROM', style: sectionLabel),
          const SizedBox(height: 6),
          Wrap(spacing: 6, children: [
            for (final a in addresses)
              ChoiceChip(
                label: Text('${a['label']}'),
                selected: pickupId == a['id'],
                showCheckmark: false,
                selectedColor: Tw.navy,
                labelStyle: TextStyle(color: pickupId == a['id'] ? Colors.white : Tw.ink2, fontWeight: FontWeight.w600),
                onSelected: (_) => setState(() => pickupId = a['id'] as String),
              ),
          ]),
          const SizedBox(height: 8),
        ],
        Row(children: [
          Checkbox(value: fragile, onChanged: (v) => setState(() => fragile = v ?? false)),
          const Text('Fragile'),
          const Spacer(),
          if (!showNote) TextButton(onPressed: () => setState(() => showNote = true), child: const Text('+ Note for rider')),
        ]),
        if (showNote) ...[_f('note', 'Note for rider'), _f('ref', 'Your order reference (optional)')],
        const SizedBox(height: 4),
        if (short)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.bad, width: 1.5)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Recharge ${rupees((q['requiredAvailable'] as num) - (q['walletAvailable'] as num))} to create this order', style: const TextStyle(color: Tw.bad, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 6),
              Text("Your wallet has ${rupees(q['walletAvailable'] as num)}. Orders are blocked below ${rupees(q['requiredAvailable'] as num)} so we never create a delivery you can't pay for.", style: const TextStyle(color: Tw.ink2)),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => push(context, const RechargeScreen()).then((_) => _quote()), child: const Text('Recharge wallet')),
            ]),
          )
        else
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Tw.soft, borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Delivery fee ${rupees(q?['deliveryFee'] as num?)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 4),
              Text(
                "${rupees(q?['undeliveredTotal'] as num?)} is held when a rider accepts; ${rupees(q?['returnFee'] as num?)} comes back on delivery. If the customer can't be reached, the ${rupees(q?['returnFee'] as num?)} pays for the return.",
                style: const TextStyle(color: Tw.ink2, fontSize: 13),
              ),
            ]),
          ),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: busy || q?['canCreate'] != true ? null : _submit, child: Text(busy ? 'Creating…' : 'Create order')),
        const SizedBox(height: 24),
      ]),
    );
  }
}

String _mmss(num s) => mmss(Duration(seconds: s.round()));
int? _minsBetween(String? a, String? b) => a == null || b == null ? null : DateTime.parse(b).difference(DateTime.parse(a)).inMinutes;
const _offer = {'DECLINED': 'Declined', 'EXPIRED': 'No answer', 'ACCEPTED': 'Accepted', 'PENDING': 'Deciding', 'CANCELLED': 'Withdrawn'};

/// B09–B14 · One order screen that changes with the status.
class OrderDetail extends StatefulWidget {
  const OrderDetail({super.key, required this.id});
  final String id;
  @override
  State<OrderDetail> createState() => _OrderDetailState();
}

class _OrderDetailState extends State<OrderDetail> {
  Map<String, dynamic>? o;
  Map<String, dynamic>? wallet;
  Timer? _poll, _tick;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _load());
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && ['READY', 'ASSIGNING', 'ARRIVED'].contains(o?['status'])) setState(() {});
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await bizApi.get('/business/orders/${widget.id}') as Map<String, dynamic>;
      if (r['status'] == 'DELIVERED' && wallet == null) wallet = await bizApi.get('/business/wallet') as Map<String, dynamic>;
      if (mounted) setState(() => o = r);
    } catch (_) {}
  }

  Future<bool> _confirm(String text) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(content: Text(text), actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Yes')),
        ]),
      ) ??
      false;

  Future<void> _act(String path, {Map<String, dynamic> body = const {}, String? confirm, String? done}) async {
    if (confirm != null && !await _confirm(confirm)) return;
    try {
      await bizApi.post('/business/orders/${widget.id}/$path', body);
      if (done != null && mounted) toast(context, done);
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.nextAction == 'RECHARGE') {
        toast(context, e.message, error: true);
        await push(context, const RechargeScreen());
      } else {
        toast(context, e.message, error: true);
      }
    }
  }

  Future<void> _requestCancel() async {
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Request cancellation'),
        content: TextField(controller: note, decoration: const InputDecoration(labelText: 'Why cancel? Support will check with the rider.')),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Back')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Send'))],
      ),
    );
    if (ok == true) await _act('request-cancellation', body: {'note': note.text}, done: 'Cancellation requested. Support will confirm.');
  }

  Widget _kv(List<(String, String)> rows) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
        child: Column(children: [
          for (final (k, v) in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 120, child: Text(k, style: const TextStyle(color: Tw.muted))),
                Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600))),
              ]),
            ),
        ]),
      );

  Widget _title(String t, [String? sub]) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t, style: Tw.display(22)),
        if (sub != null) ...[const SizedBox(height: 4), Text(sub, style: const TextStyle(color: Tw.muted, fontSize: 14))],
      ]);

  Widget _danger(String label, VoidCallback onTap) => OutlinedButton(
        style: OutlinedButton.styleFrom(foregroundColor: Tw.bad, side: const BorderSide(color: Tw.badBg, width: 1.5)),
        onPressed: onTap,
        child: Text(label),
      );

  Widget get _cancelFree => _danger('Cancel · ₹0', () => _act('cancel', confirm: 'Cancel this order? No charge.'));

  @override
  Widget build(BuildContext context) {
    final d = o;
    if (d == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final s = d['status'] as String;
    return Scaffold(
      appBar: AppBar(title: Text(d['code'] as String), actions: [
        Padding(padding: const EdgeInsets.only(right: 12), child: Center(child: StatusChip(s, label: statusLabel[s]))),
      ]),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: _body(d, s).expand((w) => [w, const SizedBox(height: 12)]).toList()),
      ),
    );
  }

  List<Widget> _body(Map<String, dynamic> d, String s) {
    final fees = d['fees'] as Map<String, dynamic>;
    final total = (fees['delivery'] as num) + (fees['return'] as num);
    final customer = d['customer'] as Map<String, dynamic>;
    final parcel = d['parcel'] as Map<String, dynamic>;
    final rider = d['rider'] as Map<String, dynamic>?;
    final times = d['times'] as Map<String, dynamic>? ?? {};
    final now = DateTime.now();

    // B09 · Created: label it, then Ready.
    if (s == 'CREATED') {
      return [
        _title('Pack it, seal it, then mark Ready', 'We look for a rider only after Ready, so nobody waits at your counter.'),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.navy, width: 2)),
          child: Column(children: [
            const Text('WRITE ON THE PARCEL', style: sectionLabel),
            const SizedBox(height: 6),
            Text(d['code'] as String, style: Tw.display(32)),
            const SizedBox(height: 4),
            Text('${customer['name']} · ${customer['phone']}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
        ),
        _kv([
          ('Parcel', "${parcel['description']} · ${((parcel['weightGrams'] as num) / 1000).toStringAsFixed(1)} kg · ${rupees(parcel['declaredValue'] as num)}${parcel['isFragile'] == true ? ' · Fragile' : ''}"),
          ('Drop', "${customer['address']}${customer['landmark'] != null ? ', ${customer['landmark']}' : ''}"),
          ('Customer OTP', 'Sent at assignment'),
          ('Fee', '${rupees(fees['delivery'] as num)} · ${rupees(total)} held when a rider accepts, ${rupees(fees['return'] as num)} back on delivery'),
        ]),
        ElevatedButton(onPressed: () => _act('ready'), child: const Text('Mark Ready · find a rider')),
        _cancelFree,
      ];
    }

    // B10 · Assigning.
    if (s == 'READY' || s == 'ASSIGNING') {
      final a = d['assignment'] as Map<String, dynamic>?;
      final max = (a?['maxSeconds'] as num?) ?? 180;
      final used = a?['startedAt'] != null ? (now.difference(DateTime.parse(a!['startedAt'] as String)).inSeconds).clamp(0, max).toDouble() : 0.0;
      final offers = (a?['offers'] as List?) ?? [];
      return [
        _title('Offering to the nearest rider', 'Each rider gets ${a?['offerSeconds'] ?? 30} seconds to accept. We try up to ${a?['maxRiders'] ?? 5} riders or ${_mmss(max)} minutes.'),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (offers.isEmpty) const Text('Finding riders near your shop…', style: TextStyle(color: Tw.muted)),
            for (final f in offers)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(children: [
                  Expanded(child: Text('Rider ${f['n']} · ${(f['distanceKm'] as num).toStringAsFixed(1)} km')),
                  Text(
                    '${_offer[f['status']] ?? f['status']}${f['status'] == 'PENDING' ? ' · ${DateTime.parse(f['expiresAt'] as String).difference(now).inSeconds.clamp(0, 999)} s' : ''}',
                    style: TextStyle(color: f['status'] == 'PENDING' ? Tw.tealInk : Tw.muted, fontWeight: f['status'] == 'PENDING' ? FontWeight.w700 : FontWeight.w400),
                  ),
                ]),
              ),
            const SizedBox(height: 10),
            ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: used / max, minHeight: 8, backgroundColor: Tw.soft, color: Tw.teal)),
            const SizedBox(height: 6),
            Text('Time used ${_mmss(used)} of ${_mmss(max)}', style: const TextStyle(color: Tw.muted, fontSize: 13)),
          ]),
        ),
        const Text('Nothing is charged until a rider accepts.', style: TextStyle(color: Tw.muted, fontSize: 13)),
        _danger('Cancel order · ₹0', () => _act('cancel', confirm: 'Cancel this order? No charge.')),
      ];
    }

    // B13 · No rider.
    if (s == 'NO_RIDER') {
      final a = d['assignment'] as Map<String, dynamic>?;
      final n = ((a?['offers'] as List?) ?? []).length;
      final left = a?['retriesLeft'] as num?;
      return [
        Notice(
          'No rider available at this moment in your area. ${n > 0 ? '$n rider${n > 1 ? 's were' : ' was'} offered this order. None could take it.' : 'No riders were free near your shop.'} Please retry in 10 minutes.',
          tone: 'warn',
        ),
        _kv([('Order status', 'Still Ready'), ('Charged', '₹0'), ('Retries left today', left?.toString() ?? '—')]),
        const Text('Ready orders with no rider by end of day are cancelled automatically, with no charge.', style: TextStyle(color: Tw.muted, fontSize: 13)),
        ElevatedButton(onPressed: left == 0 ? null : () => _act('retry-assignment'), child: const Text('Retry assignment')),
        _cancelFree,
      ];
    }

    // B12 · Delivered.
    if (s == 'DELIVERED') {
      return [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: Tw.okBg, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('✓ Delivered to ${(customer['name'] as String).split(' ').first}', style: Tw.display(22, color: Tw.ok)),
            const SizedBox(height: 4),
            Text('OTP confirmed at the door · ${clock(times['deliveredAt'] as String?)}'),
          ]),
        ),
        _kv([
          ('Delivery fee', '${rupees(fees['delivery'] as num)} deducted'),
          ('Wallet now', rupees(wallet?['available'] as num?)),
          ('Rider', rider?['firstName'] as String? ?? '—'),
          ('Proof', 'OTP · GPS at drop · time'),
          ('Ready → Delivered', '${_minsBetween(times['readyAt'] as String?, times['deliveredAt'] as String?) ?? '—'} min'),
        ]),
        Row(children: [
          Expanded(child: ElevatedButton(onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const CreateOrder())), child: const Text('New delivery'))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)), onPressed: () => push(context, const WalletScreen(standalone: true)), child: const Text('View passbook'))),
        ]),
      ];
    }

    // B14 · Undelivered and return.
    if (['UNDELIVERED', 'RETURNING', 'RETURNED'].contains(s)) {
      final reason = d['undeliveredReason'] as String?;
      final wait = _minsBetween(times['arrivedAt'] as String?, times['undeliveredAt'] as String?);
      final who = rider?['firstName'] as String? ?? 'The rider';
      return [
        _title('${reason ?? 'Not delivered'}. ${s == 'RETURNED' ? 'The parcel is back with you.' : '$who is bringing it back.'}', 'Every attempt is logged so you can check it.'),
        _kv([('Arrived at drop', clock(times['arrivedAt'] as String?)), ('Waited', wait != null ? '$wait min' : '—'), ('Reason', reason ?? '—')]),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
          child: Column(children: [
            Row(children: [const Expanded(child: Text('Forward')), Text(rupees(fees['delivery'] as num))]),
            const SizedBox(height: 6),
            Row(children: [const Expanded(child: Text('Return')), Text(rupees(fees['return'] as num))]),
            const Divider(height: 18),
            Row(children: [const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w800))), Text(rupees(total), style: const TextStyle(fontWeight: FontWeight.w800))]),
          ]),
        ),
        if (s == 'RETURNING')
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Tw.soft, borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('When ${rider?['firstName'] ?? 'the rider'} reaches your shop', style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('Check the seal and label, then confirm. This closes the order as Returned.${d['returnOtp'] != null ? ' Give the rider this return code:' : ''}'),
              if (d['returnOtp'] != null) ...[
                const SizedBox(height: 8),
                Text('${d['returnOtp']}', textAlign: TextAlign.center, style: Tw.display(36).copyWith(letterSpacing: 8)),
              ],
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => _act('confirm-return', confirm: 'Is the parcel back with you, seal intact?'), child: const Text('Confirm parcel received')),
            ]),
          ),
        OutlinedButton(onPressed: () => push(context, SupportScreen(orderCode: d['code'] as String, type: 'WALLET_DISPUTE')), child: const Text('Question this charge')),
      ];
    }

    if (s == 'CANCELLED') {
      return [
        Notice('Cancelled${d['cancelReason'] != null ? ': ${d['cancelReason']}' : ''}. Any hold was released.'),
        ElevatedButton(onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const CreateOrder())), child: const Text('New delivery')),
      ];
    }

    // B11 · With a rider: Assigned → Arrived.
    final onWay = s == 'OUT_FOR_DELIVERY' || s == 'ARRIVED';
    final steps = <(String, String?)>[
      ('Ready', times['readyAt'] as String?),
      ('Assigned · ${rupees(total)} held', times['assignedAt'] as String?),
      ('Picked Up · seal checked', times['pickedUpAt'] as String?),
      (s == 'ARRIVED' ? 'Arrived at the door' : 'Out for Delivery', onWay ? (times['arrivedAt'] as String? ?? 'now') : null),
    ];
    final waitLeft = d['waitEndsAt'] != null ? DateTime.parse(d['waitEndsAt'] as String).difference(now).inSeconds.clamp(0, 99999) : null;
    final name = rider?['firstName'] as String? ?? 'Rider';
    final otp = d['otp'] as Map<String, dynamic>? ?? {};
    final loc = rider?['location'] as Map<String, dynamic>?;
    return [
      Text(
        s == 'ASSIGNED' ? '$name is coming to pick up' : s == 'ARRIVED' ? '$name is at the door${waitLeft != null ? ' · waiting ${_mmss(waitLeft)} more' : ''}' : s == 'PICKED_UP' ? 'Parcel picked up' : 'On the way to the customer',
        style: Tw.display(22),
      ),
      if (rider != null)
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
          child: Row(children: [
            CircleAvatar(backgroundColor: Tw.tealBg, child: Text(name.substring(0, name.length < 2 ? name.length : 2).toUpperCase(), style: const TextStyle(color: Tw.tealInk, fontWeight: FontWeight.w800))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text('Bike ${rider['vehicleNumber'] ?? ''} · ${rider['phoneMasked'] ?? ''}', style: const TextStyle(color: Tw.muted, fontSize: 13)),
            ])),
            if (loc != null)
              TextButton(
                onPressed: () => launchUrl(Uri.parse('https://www.google.com/maps/search/?api=1&query=${loc['lat']},${loc['lng']}'), mode: LaunchMode.externalApplication),
                child: const Text('Map'),
              ),
          ]),
        ),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
        child: Column(children: [
          for (final (label, at) in steps)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                Icon(at != null ? Icons.check_circle : Icons.radio_button_unchecked, size: 20, color: at != null ? Tw.teal : Tw.faint),
                const SizedBox(width: 10),
                Expanded(child: Text(label, style: TextStyle(fontWeight: at != null ? FontWeight.w700 : FontWeight.w400, color: at != null ? Tw.ink : Tw.muted))),
                Text(at == 'now' ? 'now' : at != null ? clock(at) : '', style: const TextStyle(color: Tw.muted, fontSize: 13)),
              ]),
            ),
        ]),
      ),
      _kv([
        ('Customer OTP', "${otp['status'] == 'SENT' ? 'Sent by SMS + WhatsApp' : 'Not sent yet'}${otp['locked'] == true ? ' · locked, support is verifying' : ''}"),
        ('Customer', '${customer['name']} · ${customer['phone']}'),
      ]),
      Row(children: [
        Expanded(
          child: OutlinedButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: d['trackingUrl'] as String));
              toast(context, 'Tracking link copied');
            },
            child: const Text('Copy link'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton(
            onPressed: () => launchUrl(Uri.parse('https://wa.me/91${customer['phone']}?text=${Uri.encodeComponent('Track your parcel: ${d['trackingUrl']}')}'), mode: LaunchMode.externalApplication),
            child: const Text('WhatsApp'),
          ),
        ),
      ]),
      if (s == 'ASSIGNED') _danger('Request cancellation', _requestCancel),
    ];
  }
}
