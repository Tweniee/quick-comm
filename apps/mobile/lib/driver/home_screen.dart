import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'documents_screen.dart';
import 'driver_app.dart';
import 'earnings_screen.dart';
import 'help_screen.dart';
import 'job_view.dart';
import 'login_screen.dart';
import 'strings.dart';

/// D02 offline · D03 online · D04 offer · D15 paused, and the live job (D05–D12).
/// Polls every 4 s: works when sockets drop and on poor networks.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.ctx, required this.onLanguage});
  final DriverCtx ctx;
  final Future<void> Function(String) onLanguage;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? me;
  Map<String, dynamic>? feed;
  Map<String, dynamic>? earnings;
  Timer? _poll;
  int queued = 0;
  bool busy = false;

  DriverCtx get ctx => widget.ctx;
  bool get online => me != null && me!['availability'] != 'OFFLINE';
  String get firstName => (me?['name'] as String? ?? '').split(' ').first;

  @override
  void initState() {
    super.initState();
    _refresh();
    _poll = Timer.periodic(const Duration(seconds: 4), (_) => _tick());
  }

  @override
  void dispose() {
    _poll?.cancel();
    ctx.location.stop();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final m = await ctx.api.get('/driver/me') as Map<String, dynamic>;
      final e = await ctx.api.get('/driver/earnings') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() { me = m; earnings = e; });
      if (m['availability'] != 'OFFLINE') _startLocation();
      await _tick();
    } on ApiException catch (e) {
      if (mounted && !e.isNetwork) toast(context, e.message, error: true);
    }
  }

  Future<void> _tick() async {
    if (!online) return;
    try {
      await ctx.queue.flush();
      final f = await ctx.api.get('/driver/feed') as Map<String, dynamic>;
      final q = await ctx.queue.length;
      if (mounted) setState(() { feed = f; queued = q; });
    } on ApiException catch (_) {
      final q = await ctx.queue.length;
      if (mounted) setState(() => queued = q);
    }
  }

  void _startLocation() {
    final onJob = me?['currentOrderId'] != null;
    // Throttled: 15 s on a job, 30 s while waiting. Never when offline.
    ctx.location.start(Duration(seconds: onJob ? 15 : 30), (p) async {
      try { await ctx.api.post('/driver/location', {'lat': p.latitude, 'lng': p.longitude}); } catch (_) {}
    });
  }

  Future<void> _setOnline(bool on) async {
    setState(() => busy = true);
    try {
      if (on) {
        if (!await ctx.location.ensurePermission()) {
          if (mounted) toast(context, S.t('locationNeeded'), error: true);
          return;
        }
        await ctx.location.current();
      }
      final m = await ctx.api.post('/driver/availability', {'online': on, ...ctx.location.stamp()}) as Map<String, dynamic>;
      setState(() => me = m);
      if (online) { _startLocation(); await _tick(); } else { ctx.location.stop(); setState(() => feed = null); }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _open(Widget w) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => w)).then((_) => _refresh());

  Future<void> _logout() async {
    await ctx.api.setToken(null);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => LoginScreen(ctx: ctx, onLanguage: widget.onLanguage)));
  }

  @override
  Widget build(BuildContext context) {
    if (me == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final job = feed?['job'] as Map<String, dynamic>?;
    final offer = feed?['offer'] as Map<String, dynamic>?;
    if (job != null) {
      return JobScreen(ctx: ctx, job: job, queued: queued, onChanged: () async { await _tick(); await _refresh(); }, onOffline: () => _setOnline(false));
    }
    if (online && offer != null) return OfferScreen(ctx: ctx, offer: offer, onDone: _refresh);
    final paused = me!['status'] != 'APPROVED';
    return Scaffold(
      backgroundColor: online ? Tw.navy : Tw.bg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(padding: const EdgeInsets.all(20), children: paused ? _paused() : online ? _online() : _offline()),
        ),
      ),
    );
  }

  Widget _header({bool dark = false}) => Row(children: [
        Expanded(child: Text(online ? S.l('Online', 'ऑनलाइन') : S.l('Hi $firstName', 'नमस्ते $firstName'), style: Tw.display(26, color: dark ? Colors.white : Tw.navy))),
        LangToggle(lang: S.lang, dark: dark, onChanged: (l) async { await widget.onLanguage(l); setState(() {}); }),
        if (!online) PopupMenuButton<String>(onSelected: (v) { if (v == 'logout') _logout(); }, itemBuilder: (_) => [PopupMenuItem(value: 'logout', child: Text(S.t('logout')))]),
      ]);

  List<Widget> _offline() {
    final warnings = (me!['expiryWarnings'] as List? ?? []);
    return [
      _header(),
      const SizedBox(height: 16),
      Row(children: [
        StatTile(label: S.t('today'), value: rupees(earnings?['today']?['amount'] as num?)),
        const SizedBox(width: 12),
        StatTile(label: S.t('thisWeek'), value: rupees(earnings?['thisWeek']?['amount'] as num?)),
      ]),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: Tw.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(S.l("You're offline", 'आप ऑफलाइन हैं'), style: Tw.display(22)),
          const SizedBox(height: 6),
          Text(S.l('No jobs and no location sharing until you go online.', 'ऑनलाइन जाने तक न जॉब, न लोकेशन शेयर।'), style: const TextStyle(color: Tw.muted)),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: busy ? null : () => _setOnline(true), child: Text(S.t('goOnline'))),
        ]),
      ),
      const SizedBox(height: 12),
      for (final w in warnings) ...[
        Notice(S.l('${w['doc']} expires in ${w['daysLeft']} days · upload the renewed ${w['doc']}', '${w['doc']} ${w['daysLeft']} दिन में खत्म · नया ${w['doc']} अपलोड करें'), tone: 'warn',
            action: TextButton(onPressed: () => _open(DocumentsScreen(ctx: ctx)), child: Text(S.l('Fix', 'ठीक करें')))),
        const SizedBox(height: 8),
      ],
      if (queued > 0) ...[Notice('${S.t('queued')} ($queued)', tone: 'warn'), const SizedBox(height: 8)],
      LinkRow(S.l('Earnings & payouts', 'कमाई और भुगतान'), icon: Icons.account_balance_wallet_outlined, onTap: () => _open(EarningsScreen(ctx: ctx))),
      const SizedBox(height: 8),
      LinkRow(S.l('Documents', 'दस्तावेज़'), icon: Icons.badge_outlined, onTap: () => _open(DocumentsScreen(ctx: ctx))),
      const SizedBox(height: 8),
      LinkRow(S.t('help'), icon: Icons.support_agent, onTap: () => _open(HelpScreen(ctx: ctx))),
    ];
  }

  List<Widget> _online() => [
        _header(dark: true),
        const SizedBox(height: 8),
        Row(children: [const Icon(Icons.circle, size: 10, color: Tw.teal), const SizedBox(width: 6), Text(S.l('Location shared', 'लोकेशन शेयर हो रही है'), style: const TextStyle(color: Color(0xFFCBD5E1)))]),
        const SizedBox(height: 48),
        const Center(child: _Pulse()),
        const SizedBox(height: 32),
        Text(S.t('waiting'), textAlign: TextAlign.center, style: Tw.display(22, color: Colors.white)),
        const SizedBox(height: 8),
        Text(S.l('Keep the app open. A new job rings with 30 seconds to accept.', 'ऐप खुला रखें। नया जॉब आने पर 30 सेकंड में स्वीकार करें।'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFCBD5E1))),
        const SizedBox(height: 40),
        Row(children: [
          StatTile(dark: true, label: S.t('today'), value: rupees(earnings?['today']?['amount'] as num?)),
          const SizedBox(width: 12),
          StatTile(dark: true, label: S.l('Jobs', 'जॉब'), value: '${earnings?['today']?['legs'] ?? 0}'),
        ]),
        if (queued > 0) ...[const SizedBox(height: 12), Notice('${S.t('queued')} ($queued)', tone: 'warn')],
        const SizedBox(height: 24),
        OutlinedButton(
          style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Tw.navy2, width: 1.5)),
          onPressed: busy ? null : () => _setOnline(false),
          child: Text(S.t('goOffline')),
        ),
      ];

  List<Widget> _paused() {
    final reason = me!['statusReason'] as String?;
    return [
      _header(),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: Tw.badBg, borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(S.l('ACCOUNT PAUSED', 'खाता रुका हुआ है'), style: const TextStyle(color: Tw.bad, fontWeight: FontWeight.w800, letterSpacing: 0.8, fontSize: 12)),
          const SizedBox(height: 6),
          Text(reason ?? S.l('Support has paused your account', 'सपोर्ट ने आपका खाता रोका है'), style: Tw.display(22, color: Tw.bad)),
          const SizedBox(height: 8),
          Text(S.l("You can't go online or get jobs until support approves your renewed document. Your earnings are safe.", 'नया दस्तावेज़ मंज़ूर होने तक आप ऑनलाइन नहीं जा सकते। आपकी कमाई सुरक्षित है।'), style: const TextStyle(color: Tw.ink2)),
        ]),
      ),
      const SizedBox(height: 16),
      ElevatedButton(onPressed: () => _open(DocumentsScreen(ctx: ctx)), child: Text(S.l('Upload renewed document', 'नया दस्तावेज़ अपलोड करें'))),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: null, icon: const Icon(Icons.lock_outline), label: Text(S.l('Go online · Locked', 'ऑनलाइन · बंद'))),
      const SizedBox(height: 16),
      Notice(S.l('Pending payout ${rupees(earnings?['unpaid'] as num?)} · Monday', 'बाकी भुगतान ${rupees(earnings?['unpaid'] as num?)} · सोमवार')),
      const SizedBox(height: 8),
      LinkRow(S.l('Talk to support', 'सपोर्ट से बात करें'), icon: Icons.call, onTap: () { if (kSupportPhone.isNotEmpty) { launchUrl(Uri.parse('tel:$kSupportPhone')); } else { _open(HelpScreen(ctx: ctx)); } }),
    ];
  }
}

class _Pulse extends StatefulWidget {
  const _Pulse();
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
  @override
  void dispose() { c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: c,
        builder: (_, _) => Container(
          width: 140, height: 140, alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: Tw.teal.withValues(alpha: 0.25 * (1 - c.value))),
          child: Container(width: 64, height: 64, decoration: const BoxDecoration(shape: BoxShape.circle, color: Tw.teal), child: const Icon(Icons.two_wheeler, color: Tw.navy, size: 32)),
        ),
      );
}

/// D04 · Job offer with a countdown. Auto-assign is a proposal; the rider decides.
class OfferScreen extends StatefulWidget {
  const OfferScreen({super.key, required this.ctx, required this.offer, required this.onDone});
  final DriverCtx ctx;
  final Map<String, dynamic> offer;
  final Future<void> Function() onDone;
  @override
  State<OfferScreen> createState() => _OfferScreenState();
}

class _OfferScreenState extends State<OfferScreen> {
  Timer? _t;
  int left = 0;
  int total = 30;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _calc();
    total = left.clamp(1, 60);
    _t = Timer.periodic(const Duration(seconds: 1), (_) => _calc());
  }

  void _calc() {
    final exp = DateTime.parse(widget.offer['expiresAt'] as String);
    setState(() => left = exp.difference(DateTime.now()).inSeconds.clamp(0, 999));
  }

  @override
  void dispose() { _t?.cancel(); super.dispose(); }

  Future<void> _respond(bool accept) async {
    setState(() => busy = true);
    try {
      await widget.ctx.api.post('/driver/offers/${widget.offer['offerId']}/${accept ? 'accept' : 'decline'}');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
    await widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final parcel = o['parcel'] as Map<String, dynamic>;
    final drop = o['drop'] as Map<String, dynamic>;
    return Scaffold(
      backgroundColor: Tw.navy,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Row(children: [
            Expanded(child: Text(S.t('newJob'), style: Tw.display(26, color: Colors.white))),
            SizedBox(width: 64, height: 64, child: Stack(alignment: Alignment.center, children: [
              CircularProgressIndicator(value: left / total, strokeWidth: 5, color: left < 10 ? Tw.bad : Tw.teal, backgroundColor: Tw.navy2),
              Text('${left}s', style: Tw.display(18, color: Colors.white)),
            ])),
          ]),
          const SizedBox(height: 16),
          Text(S.t('youEarn'), style: const TextStyle(color: Color(0xFFCBD5E1))),
          Text(rupees(o['earning'] as num), style: Tw.display(48, color: Tw.teal)),
          const SizedBox(height: 16),
          LabeledCard(label: '${S.t('pickup')} · ${o['distanceToPickupKm']} km ${S.l('from you', 'आपसे')}', children: [
            Text('${o['pickup']['businessName']}', style: Tw.display(20)),
            Text('${o['pickup']['address'] ?? ''}', style: const TextStyle(color: Tw.muted)),
          ]),
          const SizedBox(height: 10),
          LabeledCard(label: '${S.t('drop')} · ${drop['distanceKm']} km ${S.l('trip', 'सफर')}', children: [
            Text('${drop['area'] ?? ''}', style: Tw.display(20)),
            if (drop['landmark'] != null) Text('${drop['landmark']}', style: const TextStyle(color: Tw.muted)),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            _chip('${((parcel['weightGrams'] as num) / 1000).toStringAsFixed(1)} kg'),
            _chip(S.l('Sealed bag', 'सील्ड पैकेट')),
            if (parcel['isFragile'] == true) _chip(S.l('Fragile', 'नाज़ुक')),
            _chip(S.l('Prepaid · no cash', 'प्रीपेड · कैश नहीं')),
          ]),
          const SizedBox(height: 24),
          ElevatedButton(onPressed: busy || left == 0 ? null : () => _respond(true), child: Text(S.t('accept'))),
          const SizedBox(height: 10),
          OutlinedButton(
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Tw.navy2, width: 1.5)),
            onPressed: busy ? null : () => _respond(false),
            child: Text(S.t('decline')),
          ),
        ]),
      ),
    );
  }

  Widget _chip(String t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: Tw.navy2, borderRadius: BorderRadius.circular(10)),
        child: Text(t, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
      );
}
