import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'help_screen.dart';
import 'strings.dart';

/// The live job, one screen per step (D05–D12). During a job the app is just:
/// Navigate, Call, Pickup, Enter OTP, Delivered (masterplan §13).
class JobScreen extends StatefulWidget {
  const JobScreen({super.key, required this.ctx, required this.job, required this.onChanged, required this.onOffline, this.queued = 0});
  final DriverCtx ctx;
  final Map<String, dynamic> job;
  final Future<void> Function() onChanged;
  final Future<void> Function() onOffline;
  final int queued;
  @override
  State<JobScreen> createState() => _JobScreenState();
}

class _JobScreenState extends State<JobScreen> {
  final returnCode = TextEditingController();
  bool busy = false;
  bool atShop = false; // D05 → D06 is a local step: no status change until "Picked up".
  final checks = <bool>[false, false, false];
  Timer? _clock;

  Map<String, dynamic> get j => widget.job;
  String get id => j['id'] as String;
  String get status => j['status'] as String;
  Map<String, dynamic> get pickup => j['pickup'] as Map<String, dynamic>? ?? {};
  Map<String, dynamic> get drop => j['drop'] as Map<String, dynamic>? ?? {};
  Map<String, dynamic> get business => j['business'] as Map<String, dynamic>? ?? {};
  String get customerFirst => (drop['name'] as String? ?? '').split(' ').first;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted && status == 'ARRIVED') setState(() {}); });
  }

  @override
  void dispose() { _clock?.cancel(); super.dispose(); }

  Future<bool> _act(String path, [Map<String, dynamic> body = const {}]) async {
    setState(() => busy = true);
    await widget.ctx.location.current();
    try {
      final r = await widget.ctx.queue.send('/driver/orders/$id/$path', {...body, ...widget.ctx.location.stamp()});
      if (r == null && mounted) toast(context, S.t('queued'));
      await widget.onChanged();
      return true;
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
      return false;
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
    final outcome = await showModalBottomSheet<String>(context: context, builder: (c) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(padding: const EdgeInsets.all(16), child: Text(S.l('Did they answer?', 'क्या उन्होंने फोन उठाया?'), style: Tw.display(20))),
      for (final o in {'ANSWERED': S.l('Answered', 'उठाया'), 'NO_ANSWER': S.l('No answer', 'नहीं उठाया'), 'BUSY': S.l('Busy', 'बिज़ी'), 'UNREACHABLE': S.l('Not reachable', 'पहुंच से बाहर')}.entries)
        ListTile(title: Text(o.value, style: const TextStyle(fontSize: 18)), onTap: () => Navigator.pop(c, o.key)),
    ])));
    await _act('calls', {'target': target, 'outcome': outcome});
  }

  String? _distanceTo(Map<String, dynamic> p) {
    final me = widget.ctx.location.last;
    if (me == null || p['lat'] == null) return null;
    final m = Geolocator.distanceBetween(me.latitude, me.longitude, (p['lat'] as num).toDouble(), (p['lng'] as num).toDouble());
    return '${(m / 1000).toStringAsFixed(1)} km';
  }

  void _help() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => HelpScreen(ctx: widget.ctx, job: j, onChanged: widget.onChanged)));

  Scaffold _frame(String title, List<Widget> children, {Color? bg}) => Scaffold(
        backgroundColor: bg ?? Tw.bg,
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: Text(title),
          actions: [TextButton(onPressed: _help, child: Text(S.t('help'), style: const TextStyle(color: Colors.white)))],
        ),
        body: SafeArea(child: ListView(padding: const EdgeInsets.all(20), children: [
          if (widget.queued > 0) ...[Notice('${S.t('queued')} (${widget.queued})', tone: 'warn'), const SizedBox(height: 12)],
          ...children,
        ])),
      );

  Widget _actions(List<Widget> buttons) => Row(children: [for (var i = 0; i < buttons.length; i++) ...[if (i > 0) const SizedBox(width: 10), Expanded(child: buttons[i])]]);

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'ASSIGNED':
        return atShop ? _confirmPickup() : _toPickup();
      case 'PICKED_UP':
      case 'OUT_FOR_DELIVERY':
        return _toDrop();
      case 'ARRIVED':
        return _arrived();
      default:
        return _returning();
    }
  }

  // D05 · To pickup
  Widget _toPickup() {
    final d = _distanceTo(pickup);
    return _frame('${S.l('To pickup', 'पिकअप के लिए')}${d != null ? ' · $d' : ''}', [
      LabeledCard(label: S.l('Pick up from', 'यहां से लें'), children: [
        Text('${business['name']}', style: Tw.display(22)),
        const SizedBox(height: 4),
        Text('${pickup['address'] ?? ''}${pickup['landmark'] != null ? ', ${pickup['landmark']}' : ''}', style: const TextStyle(fontSize: 16, color: Tw.ink2)),
      ]),
      const SizedBox(height: 12),
      _actions([
        OutlinedButton.icon(onPressed: () => _navigate(pickup['lat'] as num, pickup['lng'] as num), icon: const Icon(Icons.navigation_outlined), label: Text(S.t('navigate'))),
        OutlinedButton.icon(onPressed: () => _call((pickup['contactPhone'] ?? business['phone']) as String?, 'BUSINESS'), icon: const Icon(Icons.call_outlined), label: Text(S.l('Call shop', 'दुकान को कॉल'))),
      ]),
      const SizedBox(height: 12),
      _parcelLine(),
      const SizedBox(height: 24),
      ElevatedButton(onPressed: () => setState(() => atShop = true), child: Text(S.l("I'm at the shop", 'मैं दुकान पर हूं'))),
    ]);
  }

  Widget _parcelLine() {
    final parcel = j['parcel'] as Map<String, dynamic>;
    return Text('${j['code']} · ${parcel['description']} · ${((parcel['weightGrams'] as num) / 1000).toStringAsFixed(1)} kg${parcel['isFragile'] == true ? ' · ${S.l('FRAGILE', 'नाज़ुक')}' : ''}${j['specialInstructions'] != null ? '\n${S.l('Note', 'नोट')}: ${j['specialInstructions']}' : ''}',
        style: const TextStyle(color: Tw.muted));
  }

  // D06 · Confirm pickup
  Widget _confirmPickup() {
    final labels = [S.l('Parcel is sealed', 'पार्सल सील्ड है'), S.l('Label matches order ID', 'लेबल पर ऑर्डर ID सही है'), S.l('Fits the bike box', 'बाइक बॉक्स में आता है')];
    return _frame(S.l('Confirm pickup', 'पिकअप की पुष्टि'), [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(border: Border.all(color: Tw.faint, width: 2), borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(S.l('LABEL MUST SAY', 'लेबल पर यह होना चाहिए'), style: const TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: Tw.muted)),
          Text('${j['code']}', style: Tw.display(32)),
          Text('${drop['name'] ?? ''} · ${drop['address'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
        ]),
      ),
      const SizedBox(height: 16),
      Text(S.l('Check before you take it', 'लेने से पहले जांचें'), style: Tw.display(18)),
      for (var i = 0; i < labels.length; i++)
        CheckboxListTile(contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, activeColor: Tw.tealInk, value: checks[i], onChanged: (v) => setState(() => checks[i] = v ?? false), title: Text(labels[i], style: const TextStyle(fontSize: 17))),
      const SizedBox(height: 8),
      Text(S.t('sealCheck'), style: const TextStyle(color: Tw.muted)),
      const SizedBox(height: 16),
      ElevatedButton(onPressed: busy || checks.contains(false) ? null : () => _act('pickup'), child: Text(S.l('Picked up', 'पिकअप हो गया'))),
      const SizedBox(height: 8),
      TextButton(onPressed: busy ? null : _refuse, style: TextButton.styleFrom(foregroundColor: Tw.bad), child: Text(S.l('Refuse · suspicious or too big', 'मना करें · संदिग्ध या बहुत बड़ा'))),
      TextButton(onPressed: () => setState(() => atShop = false), child: Text(S.l('Back', 'पीछे'))),
    ]);
  }

  Future<void> _refuse() async {
    final r = await showModalBottomSheet<String>(context: context, builder: (c) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(padding: const EdgeInsets.all(16), child: Text(S.t('reason'), style: Tw.display(20))),
      for (final e in refuseReasons.entries) ListTile(title: Text(e.value[S.lang]!, style: const TextStyle(fontSize: 18)), onTap: () => Navigator.pop(c, e.key)),
    ])));
    if (r != null) await _act('refuse-pickup', {'reason': r});
  }

  // D07 · To drop
  Widget _toDrop() {
    final d = _distanceTo(drop);
    return _frame('${S.l('To drop', 'ड्रॉप के लिए')}${d != null ? ' · $d' : ''}', [
      Notice(S.l('Offline? Actions save and sync later', 'ऑफलाइन? काम सेव होकर बाद में सिंक होगा')),
      const SizedBox(height: 12),
      LabeledCard(label: S.l('Deliver to', 'यहां पहुंचाएं'), children: [
        Text('${drop['name'] ?? ''}', style: Tw.display(22)),
        const SizedBox(height: 4),
        Text('${drop['address'] ?? ''}', style: const TextStyle(fontSize: 16, color: Tw.ink2)),
        if (drop['landmark'] != null) Text('${S.l('Landmark', 'निशानी')}: ${drop['landmark']}', style: const TextStyle(color: Tw.muted)),
      ]),
      const SizedBox(height: 12),
      _actions([
        OutlinedButton.icon(onPressed: () => _navigate(drop['lat'] as num, drop['lng'] as num), icon: const Icon(Icons.navigation_outlined), label: Text(S.t('navigate'))),
        OutlinedButton.icon(onPressed: () => _call(drop['phone'] as String?, 'CUSTOMER'), icon: const Icon(Icons.call_outlined), label: Text(S.t('callCustomer'))),
      ]),
      const SizedBox(height: 12),
      _parcelLine(),
      const SizedBox(height: 24),
      ElevatedButton(onPressed: busy ? null : () => _act('arrived'), child: Text(S.t('arrived'))),
    ]);
  }

  // D08 · Arrived: wait timer and calls
  Widget _arrived() {
    final waitEnds = j['waitEndsAt'] != null ? DateTime.parse(j['waitEndsAt'] as String) : null;
    final left = waitEnds?.difference(DateTime.now()) ?? Duration.zero;
    final total = waitEnds != null && j['arrivedAt'] != null ? waitEnds.difference(DateTime.parse(j['arrivedAt'] as String)) : const Duration(minutes: 15);
    final calls = j['customerCalls'] as int? ?? 0;
    final minCalls = j['minCallsRequired'] as int? ?? 2;
    final canGiveUp = left.isNegative && calls >= minCalls;
    return _frame('${S.l('At drop', 'ड्रॉप पर')} · $customerFirst', [
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: Tw.navy, borderRadius: BorderRadius.circular(16)),
        child: Column(children: [
          Text(S.l('WAIT TIMER', 'इंतज़ार'), style: const TextStyle(color: Color(0xFFCBD5E1), letterSpacing: 0.8, fontWeight: FontWeight.w700, fontSize: 12)),
          Text(left.isNegative ? '0:00' : mmss(left), style: Tw.display(56, color: Colors.white)),
          Text(S.l('left of ${mmss(total)} · stay at the location', '${mmss(total)} में से बाकी · लोकेशन पर रहें'), style: const TextStyle(color: Color(0xFFCBD5E1))),
        ]),
      ),
      const SizedBox(height: 12),
      LabeledCard(label: S.l('Calls: $calls · $minCalls needed', 'कॉल: $calls · $minCalls ज़रूरी'), children: [
        OutlinedButton.icon(onPressed: () => _call(drop['phone'] as String?, 'CUSTOMER'), icon: const Icon(Icons.call), label: Text(calls == 0 ? S.t('callCustomer') : S.l('Call again', 'फिर कॉल करें'))),
      ]),
      const SizedBox(height: 12),
      Notice(S.l('No OTP, no handover. Not even for a regular customer.', 'OTP नहीं तो पार्सल नहीं। पुराने ग्राहक को भी नहीं।'), tone: 'bad'),
      if (j['otpLocked'] == true) ...[const SizedBox(height: 8), Notice(S.l('OTP locked. Tap Help to call support.', 'OTP लॉक है। सपोर्ट के लिए मदद दबाएं।'), tone: 'bad')],
      const SizedBox(height: 16),
      ElevatedButton(onPressed: j['otpLocked'] == true ? null : _enterOtp, child: Text(S.l('Enter OTP', 'OTP डालें'))),
      const SizedBox(height: 10),
      OutlinedButton(onPressed: busy || !canGiveUp ? null : _undelivered, child: Text(S.l('Customer not available', 'ग्राहक नहीं मिला'))),
      if (!canGiveUp) Padding(padding: const EdgeInsets.only(top: 6), child: Text(S.l('Unlocks after ${mmss(total)} and $minCalls+ calls', '${mmss(total)} और $minCalls+ कॉल के बाद खुलेगा'), textAlign: TextAlign.center, style: const TextStyle(color: Tw.muted))),
    ]);
  }

  Future<void> _enterOtp() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => OtpScreen(ctx: widget.ctx, job: j)));
    if (ok == true && mounted) {
      final earned = (j['earning'] as Map)['delivery'] as num;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => DeliveredScreen(ctx: widget.ctx, code: j['code'] as String, earned: earned, onOffline: widget.onOffline)));
      await widget.onChanged();
    }
  }

  // D11 · Why not delivered?
  Future<void> _undelivered() async {
    final waited = j['arrivedAt'] != null ? DateTime.now().difference(DateTime.parse(j['arrivedAt'] as String)) : null;
    final calls = j['customerCalls'] as int? ?? 0;
    final r = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (c) => Scaffold(
          appBar: AppBar(title: Text(S.l('Why not delivered?', 'डिलीवर क्यों नहीं हुआ?'))),
          body: ListView(padding: const EdgeInsets.all(20), children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in [if (waited != null) S.l('Waited ${mmss(waited)}', 'इंतज़ार ${mmss(waited)}'), S.l('$calls calls', '$calls कॉल'), S.l('GPS at drop', 'ड्रॉप पर GPS')])
                Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), decoration: BoxDecoration(color: Tw.soft, borderRadius: BorderRadius.circular(10)), child: Text(t, style: const TextStyle(fontWeight: FontWeight.w600))),
            ]),
            const SizedBox(height: 16),
            for (final e in undeliveredReasons.entries) ...[
              Card(child: ListTile(title: Text(e.value[S.lang]!, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)), trailing: const Icon(Icons.chevron_right), onTap: () => Navigator.pop(c, e.key))),
              const SizedBox(height: 8),
            ],
            const SizedBox(height: 8),
            Text(S.l('Take the sealed parcel back to the shop. The return trip pays ${rupees((j['earning'] as Map)['return'] as num)}.', 'सील्ड पार्सल दुकान को वापस दें। वापसी के ${rupees((j['earning'] as Map)['return'] as num)} मिलेंगे।'), style: const TextStyle(color: Tw.muted)),
          ]),
        )));
    if (r != null) await _act('undelivered', {'reason': r});
  }

  // D12 · Return to business
  Widget _returning() {
    final e = j['earning'] as Map;
    final d = _distanceTo(pickup);
    return _frame('${S.l('Returning', 'वापसी')}${d != null ? ' · $d' : ''}', [
      LabeledCard(label: S.l('Return to', 'यहां वापस करें'), children: [
        Text('${business['name']}', style: Tw.display(22)),
        Text('${pickup['address'] ?? ''}', style: const TextStyle(fontSize: 16, color: Tw.ink2)),
      ]),
      const SizedBox(height: 12),
      _actions([
        OutlinedButton.icon(onPressed: () => _navigate(pickup['lat'] as num, pickup['lng'] as num), icon: const Icon(Icons.navigation_outlined), label: Text(S.t('navigate'))),
        OutlinedButton.icon(onPressed: () => _call((pickup['contactPhone'] ?? business['phone']) as String?, 'BUSINESS'), icon: const Icon(Icons.call_outlined), label: Text(S.l('Call shop', 'दुकान को कॉल'))),
      ]),
      const SizedBox(height: 12),
      Notice(S.l('Return pays ${rupees(e['return'] as num)} · total ${rupees((e['delivery'] as num) + (e['return'] as num))}', 'वापसी ${rupees(e['return'] as num)} · कुल ${rupees((e['delivery'] as num) + (e['return'] as num))}'), tone: 'ok'),
      const SizedBox(height: 12),
      Text(S.l('Hand the sealed parcel to the shop. They read you the return code from their app; enter it to close the order.', 'सील्ड पार्सल दुकान को दें। दुकान अपने ऐप से रिटर्न कोड बताएगी; उसे डालकर ऑर्डर बंद करें।'), style: const TextStyle(color: Tw.muted)),
      const SizedBox(height: 12),
      TextField(controller: returnCode, keyboardType: TextInputType.number, maxLength: 4, textAlign: TextAlign.center, style: Tw.display(32), decoration: InputDecoration(labelText: S.t('returnCode'), counterText: '')),
      const SizedBox(height: 12),
      ElevatedButton(onPressed: busy ? null : () async { if (await _act('returned', {'code': returnCode.text}) && mounted) toast(context, S.t('returned')); }, child: Text(S.l('Handed back to shop', 'दुकान को वापस दे दिया'))),
    ]);
  }
}

/// D09 · OTP keypad. 3 wrong tries lock the delivery for support.
class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.ctx, required this.job});
  final DriverCtx ctx;
  final Map<String, dynamic> job;
  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  String otp = '';
  bool busy = false;
  late int failed = widget.job['otpFailedAttempts'] as int? ?? 0;

  Future<void> _submit() async {
    setState(() => busy = true);
    await widget.ctx.location.current();
    try {
      final r = await widget.ctx.queue.send('/driver/orders/${widget.job['id']}/deliver', {'otp': otp, ...widget.ctx.location.stamp()});
      if (!mounted) return;
      if (r == null) toast(context, S.t('queued'));
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() { failed++; otp = ''; });
      toast(context, e.message, error: true);
      if (e.code == 'OTP_LOCKED') Navigator.pop(context, false);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _key(String k) => setState(() {
        if (k == 'C') { otp = ''; } else if (k == '<') { if (otp.isNotEmpty) otp = otp.substring(0, otp.length - 1); } else if (otp.length < 4) { otp += k; }
      });

  @override
  Widget build(BuildContext context) {
    final name = ((widget.job['drop'] as Map?)?['name'] as String? ?? '').split(' ').first;
    final left = (3 - failed).clamp(0, 3);
    return Scaffold(
      appBar: AppBar(title: Text(S.l('Delivery OTP', 'डिलीवरी OTP'))),
      body: SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [
        Text(S.l('Ask $name for the 4-digit OTP on their phone', '$name से उनके फोन पर आया 4 अंकों का OTP पूछें'), textAlign: TextAlign.center, style: Tw.display(20)),
        const SizedBox(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var i = 0; i < 4; i++) Container(
            width: 56, height: 64, margin: const EdgeInsets.symmetric(horizontal: 6), alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: i == otp.length ? Tw.teal : Tw.line, width: 2)),
            child: Text(i < otp.length ? otp[i] : '', style: Tw.display(30)),
          ),
        ]),
        const SizedBox(height: 12),
        Text(S.l('$left tries left. 3 wrong tries lock this delivery for support.', '$left कोशिश बाकी। 3 गलत कोशिश पर यह डिलीवरी सपोर्ट के लिए लॉक हो जाएगी।'), textAlign: TextAlign.center, style: TextStyle(color: left < 3 ? Tw.bad : Tw.muted)),
        const Spacer(),
        for (final row in [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['C', '0', '<']])
          Row(children: [
            for (final k in row) Expanded(child: Padding(padding: const EdgeInsets.all(5), child: SizedBox(height: 60, child: OutlinedButton(
              onPressed: busy ? null : () => _key(k),
              child: k == '<' ? const Icon(Icons.backspace_outlined) : Text(k == 'C' ? S.l('Clear', 'साफ') : k, style: Tw.display(k == 'C' ? 16 : 24)),
            )))),
          ]),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: busy || otp.length != 4 ? null : _submit, child: Text(S.l('Confirm & hand over', 'पुष्टि करें और सौंपें'))),
      ]))),
    );
  }
}

/// D10 · Delivered.
class DeliveredScreen extends StatefulWidget {
  const DeliveredScreen({super.key, required this.ctx, required this.code, required this.earned, required this.onOffline});
  final DriverCtx ctx;
  final String code;
  final num earned;
  final Future<void> Function() onOffline;
  @override
  State<DeliveredScreen> createState() => _DeliveredScreenState();
}

class _DeliveredScreenState extends State<DeliveredScreen> {
  Map<String, dynamic>? e;
  @override
  void initState() {
    super.initState();
    widget.ctx.api.get('/driver/earnings').then((v) { if (mounted) setState(() => e = v as Map<String, dynamic>); }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Tw.navy,
        body: SafeArea(child: Padding(padding: const EdgeInsets.all(24), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Spacer(),
          const CircleAvatar(radius: 40, backgroundColor: Tw.teal, child: Icon(Icons.check, size: 44, color: Tw.navy)),
          const SizedBox(height: 20),
          Text(S.l('Delivered', 'डिलीवर हो गया'), textAlign: TextAlign.center, style: Tw.display(32, color: Colors.white)),
          Text(S.l('OTP matched · ${widget.code}', 'OTP सही · ${widget.code}'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFCBD5E1))),
          const SizedBox(height: 28),
          Text(S.l('You earned', 'आपकी कमाई'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFCBD5E1))),
          Text('+${rupees(widget.earned)}', textAlign: TextAlign.center, style: Tw.display(48, color: Tw.teal)),
          if (e != null) Text(S.l('Today so far ${rupees(e!['today']['amount'] as num)} · ${e!['today']['legs']} jobs', 'आज अब तक ${rupees(e!['today']['amount'] as num)} · ${e!['today']['legs']} जॉब'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
          const SizedBox(height: 16),
          Text(S.l('Customer details are removed from your phone now.', 'ग्राहक की जानकारी अब आपके फोन से हटा दी गई है।'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF94A3B8))),
          const Spacer(),
          ElevatedButton(onPressed: () => Navigator.pop(context), child: Text(S.l('Ready for next job', 'अगले जॉब के लिए तैयार'))),
          const SizedBox(height: 10),
          OutlinedButton(
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Tw.navy2, width: 1.5)),
            onPressed: () async { Navigator.pop(context); await widget.onOffline(); },
            child: Text(S.t('goOffline')),
          ),
        ]))),
      );
}
