import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'strings.dart';

/// The live job. During a job the app is just: Navigate, Call, Pickup, Enter OTP, Delivered (masterplan §13).
class JobView extends StatefulWidget {
  const JobView({super.key, required this.ctx, required this.job, required this.onChanged});
  final DriverCtx ctx;
  final Map<String, dynamic> job;
  final Future<void> Function() onChanged;
  @override
  State<JobView> createState() => _JobViewState();
}

class _JobViewState extends State<JobView> {
  final otp = TextEditingController();
  final returnCode = TextEditingController();
  bool busy = false;
  Timer? _clock;

  Map<String, dynamic> get j => widget.job;
  String get id => j['id'] as String;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted && j['status'] == 'ARRIVED') setState(() {}); });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _act(String path, [Map<String, dynamic> body = const {}, String? okMsg]) async {
    setState(() => busy = true);
    await widget.ctx.location.current();
    try {
      final r = await widget.ctx.queue.send('/driver/orders/$id/$path', {...body, ...widget.ctx.location.stamp()});
      if (mounted) toast(context, r == null ? S.t('queued') : (okMsg ?? 'OK'));
      await widget.onChanged();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _navigate(num lat, num lng) => launchUrl(Uri.parse('google.navigation:q=$lat,$lng&mode=l'), mode: LaunchMode.externalApplication)
      .catchError((_) => launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=two-wheeler'), mode: LaunchMode.externalApplication));

  Future<void> _call(String? phone, String target) async {
    if (phone == null) return;
    await launchUrl(Uri.parse('tel:$phone'));
    if (!mounted) return;
    // Calls are logged from the app so the wait-and-call rule has evidence.
    final outcome = await showDialog<String>(context: context, builder: (c) => SimpleDialog(title: const Text('Did they answer?'), children: [
      for (final o in ['ANSWERED', 'NO_ANSWER', 'BUSY', 'UNREACHABLE']) SimpleDialogOption(onPressed: () => Navigator.pop(c, o), child: Padding(padding: const EdgeInsets.all(8), child: Text(o.replaceAll('_', ' '), style: const TextStyle(fontSize: 18)))),
    ]));
    await _act('calls', {'target': target, 'outcome': outcome});
  }

  Future<void> _pickReason(Map<String, Map<String, String>> reasons, String path, String key) async {
    final r = await showDialog<String>(context: context, builder: (c) => SimpleDialog(title: Text(S.t('reason')), children: [
      for (final e in reasons.entries) SimpleDialogOption(onPressed: () => Navigator.pop(c, e.key), child: Padding(padding: const EdgeInsets.all(8), child: Text(e.value[S.lang]!, style: const TextStyle(fontSize: 18)))),
    ]));
    if (r != null) await _act(path, {key: r});
  }

  Widget _title(String t, String sub) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t, style: const TextStyle(fontSize: 14, color: Colors.black54)),
        Text(sub, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
      ]);

  @override
  Widget build(BuildContext context) {
    final status = j['status'] as String;
    final pickup = j['pickup'] as Map<String, dynamic>? ?? {};
    final drop = j['drop'] as Map<String, dynamic>? ?? {};
    final parcel = j['parcel'] as Map<String, dynamic>;
    final children = <Widget>[
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(j['code'] as String, style: const TextStyle(fontFamily: 'monospace', fontSize: 18, fontWeight: FontWeight.bold)),
        Chip(label: Text(statusLabel[status] ?? status)),
      ]),
      Text('${parcel['description']} · ${(parcel['weightGrams'] as num) / 1000} kg${parcel['isFragile'] == true ? ' · FRAGILE' : ''}'),
      if (j['specialInstructions'] != null) Text('Note: ${j['specialInstructions']}', style: const TextStyle(fontWeight: FontWeight.w600)),
      const Divider(height: 24),
    ];

    if (status == 'ASSIGNED') {
      children.addAll([
        _title(S.t('pickup'), (j['business'] as Map)['name'] as String),
        Text('${pickup['address']}${pickup['landmark'] != null ? ', ${pickup['landmark']}' : ''}', style: const TextStyle(fontSize: 17)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _navigate(pickup['lat'] as num, pickup['lng'] as num), icon: const Icon(Icons.navigation), label: Text(S.t('navigate')))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: () => _call((pickup['contactPhone'] ?? (j['business'] as Map)['phone']) as String?, 'BUSINESS'), icon: const Icon(Icons.call), label: Text(S.t('callBusiness')))),
        ]),
        const SizedBox(height: 12),
        Text(S.t('sealCheck'), style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 8),
        ElevatedButton(onPressed: busy ? null : () => _act('pickup'), child: Text(S.t('confirmPickup'))),
        TextButton(onPressed: busy ? null : () => _pickReason(refuseReasons, 'refuse-pickup', 'reason'), child: Text(S.t('refusePickup'))),
      ]);
    } else if (status == 'OUT_FOR_DELIVERY' || status == 'PICKED_UP') {
      children.addAll([
        _title(S.t('drop'), drop['name'] as String? ?? ''),
        Text('${drop['address']}${drop['landmark'] != null ? ', ${drop['landmark']}' : ''}', style: const TextStyle(fontSize: 17)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _navigate(drop['lat'] as num, drop['lng'] as num), icon: const Icon(Icons.navigation), label: Text(S.t('navigate')))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: () => _call(drop['phone'] as String?, 'CUSTOMER'), icon: const Icon(Icons.call), label: Text(S.t('callCustomer')))),
        ]),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: busy ? null : () => _act('arrived'), child: Text(S.t('arrived'))),
        TextButton(onPressed: busy ? null : () => _act('undelivered', {'reason': 'RIDER_COULD_NOT_FIND_LOCATION'}), child: Text(undeliveredReasons['RIDER_COULD_NOT_FIND_LOCATION']![S.lang]!)),
      ]);
    } else if (status == 'ARRIVED') {
      final waitEnds = j['waitEndsAt'] != null ? DateTime.parse(j['waitEndsAt'] as String) : null;
      final left = waitEnds?.difference(DateTime.now());
      final calls = j['customerCalls'] as int? ?? 0;
      final minCalls = j['minCallsRequired'] as int? ?? 2;
      children.addAll([
        _title(S.t('drop'), drop['name'] as String? ?? ''),
        OutlinedButton.icon(onPressed: () => _call(drop['phone'] as String?, 'CUSTOMER'), icon: const Icon(Icons.call), label: Text('${S.t('callCustomer')} (${S.t('calls')}: $calls)')),
        const SizedBox(height: 16),
        Text(S.t('otpPrompt'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 4, textAlign: TextAlign.center, style: const TextStyle(fontSize: 40, letterSpacing: 16, fontWeight: FontWeight.bold)),
        if (j['otpLocked'] == true) Text('OTP locked. Tap Help to call support.', style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.bold)),
        Text(S.t('noOtpNoDelivery'), style: TextStyle(color: Colors.red.shade700)),
        const SizedBox(height: 8),
        ElevatedButton(onPressed: busy ? null : () => _act('deliver', {'otp': otp.text}, S.t('delivered')), child: Text(S.t('deliver'))),
        const Divider(height: 32),
        if (left != null && !left.isNegative)
          Text('${S.t('waitTimer')}: ${left.inMinutes}:${(left.inSeconds % 60).toString().padLeft(2, '0')} · ${S.t('calls')} $calls/$minCalls', style: const TextStyle(fontSize: 16)),
        OutlinedButton(onPressed: busy ? null : () => _pickReason(undeliveredReasons, 'undelivered', 'reason'), child: Text(S.t('undelivered'))),
      ]);
    } else if (status == 'RETURNING' || status == 'UNDELIVERED') {
      children.addAll([
        _title(S.t('returnTitle'), (j['business'] as Map)['name'] as String),
        Text('${pickup['address']}', style: const TextStyle(fontSize: 17)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _navigate(pickup['lat'] as num, pickup['lng'] as num), icon: const Icon(Icons.navigation), label: Text(S.t('navigate')))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: () => _call((pickup['contactPhone'] ?? (j['business'] as Map)['phone']) as String?, 'BUSINESS'), icon: const Icon(Icons.call), label: Text(S.t('callBusiness')))),
        ]),
        const SizedBox(height: 16),
        Text(S.t('returnCode')),
        TextField(controller: returnCode, keyboardType: TextInputType.number, maxLength: 4, textAlign: TextAlign.center, style: const TextStyle(fontSize: 36, letterSpacing: 12)),
        ElevatedButton(onPressed: busy ? null : () => _act('returned', {'code': returnCode.text}, S.t('returned')), child: Text(S.t('confirmReturn'))),
      ]);
    }

    children.addAll([
      const SizedBox(height: 16),
      TextButton.icon(
        style: TextButton.styleFrom(foregroundColor: Colors.red.shade700),
        onPressed: () async {
          try { await widget.ctx.api.post('/driver/orders/$id/help', {'message': 'Help requested from app'}); if (context.mounted) toast(context, 'Support notified'); } on ApiException catch (e) { if (context.mounted) toast(context, e.message, error: true); }
        },
        icon: const Icon(Icons.support_agent), label: Text(S.t('help')),
      ),
      Text('${S.t('youEarn')}: ${rupees((j['earning'] as Map)['delivery'] as num)}', textAlign: TextAlign.center, style: const TextStyle(color: brand)),
    ]);

    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children)));
  }
}
