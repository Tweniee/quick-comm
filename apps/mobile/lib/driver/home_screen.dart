import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'earnings_screen.dart';
import 'job_view.dart';
import 'login_screen.dart';
import 'strings.dart';

/// Home: online/offline toggle, today's earnings, and either the pending offer or the one live job.
/// Uses polling (works when sockets drop / on poor networks).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.ctx, required this.onLanguage});
  final DriverCtx ctx;
  final Future<void> Function() onLanguage;
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
    final busy = me?['currentOrderId'] != null;
    // Throttled: 15 s on a job, 30 s while waiting. Never when offline.
    ctx.location.start(Duration(seconds: busy ? 15 : 30), (p) async {
      try { await ctx.api.post('/driver/location', {'lat': p.latitude, 'lng': p.longitude}); } catch (_) {}
    });
  }

  Future<void> _toggle() async {
    setState(() => busy = true);
    try {
      if (!online) {
        if (!await ctx.location.ensurePermission()) {
          if (mounted) toast(context, S.t('locationNeeded'), error: true);
          return;
        }
        await ctx.location.current();
      }
      final m = await ctx.api.post('/driver/availability', {'online': !online, ...ctx.location.stamp()}) as Map<String, dynamic>;
      setState(() => me = m);
      if (online) { _startLocation(); await _tick(); } else { ctx.location.stop(); setState(() => feed = null); }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = feed?['job'] as Map<String, dynamic>?;
    final offer = feed?['offer'] as Map<String, dynamic>?;
    return Scaffold(
      appBar: AppBar(
        title: Text(me?['name'] as String? ?? S.t('appTitle')),
        actions: [
          TextButton(onPressed: () async { await widget.onLanguage(); setState(() {}); }, child: Text(S.t('language'))),
          if (job == null)
            PopupMenuButton<String>(onSelected: (v) async {
              if (v == 'earn') Navigator.of(context).push(MaterialPageRoute(builder: (_) => EarningsScreen(ctx: ctx)));
              if (v == 'logout') {
                await ctx.api.setToken(null);
                if (!context.mounted) return;
                Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => LoginScreen(ctx: ctx, onLanguage: widget.onLanguage)));
              }
            }, itemBuilder: (_) => [PopupMenuItem(value: 'earn', child: Text(S.t('earnings'))), PopupMenuItem(value: 'logout', child: Text(S.t('logout')))]),
        ],
      ),
      body: me == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                if (queued > 0) Card(color: Colors.amber.shade100, child: ListTile(leading: const Icon(Icons.cloud_off), title: Text('${S.t('queued')} ($queued)'))),
                for (final w in (me!['expiryWarnings'] as List? ?? []))
                  Card(color: Colors.orange.shade100, child: ListTile(leading: const Icon(Icons.warning), title: Text('${w['doc']}: ${w['daysLeft']} days left'))),
                if (me!['status'] != 'APPROVED') Card(color: Colors.red.shade100, child: ListTile(title: Text('${me!['status']}: ${me!['statusReason'] ?? ''}'))),
                if (job != null)
                  JobView(ctx: ctx, job: job, onChanged: () async { await _tick(); await _refresh(); })
                else ...[
                  _statusCard(),
                  const SizedBox(height: 12),
                  if (offer != null) OfferCard(ctx: ctx, offer: offer, onDone: _refresh)
                  else if (online) Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(S.t('waiting'), style: Theme.of(context).textTheme.titleMedium))),
                ],
              ]),
            ),
    );
  }

  Widget _statusCard() {
    return Card(
      color: online ? Colors.green.shade50 : Colors.grey.shade200,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(online ? S.t('online') : S.t('offline'), style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: online ? brand : Colors.black54)),
          const SizedBox(height: 8),
          Text('${S.t('today')}: ${rupees(earnings?['today']?['amount'] as num?)} · ${earnings?['today']?['legs'] ?? 0} legs', style: const TextStyle(fontSize: 18)),
          const SizedBox(height: 12),
          ElevatedButton(
            style: online ? ElevatedButton.styleFrom(backgroundColor: Colors.grey.shade700) : null,
            onPressed: busy ? null : _toggle,
            child: Text(online ? S.t('goOffline') : S.t('goOnline')),
          ),
        ]),
      ),
    );
  }
}

/// Job offer with a countdown. Auto-assign is a proposal; the rider decides (masterplan decision 17).
class OfferCard extends StatefulWidget {
  const OfferCard({super.key, required this.ctx, required this.offer, required this.onDone});
  final DriverCtx ctx;
  final Map<String, dynamic> offer;
  final Future<void> Function() onDone;
  @override
  State<OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<OfferCard> {
  Timer? _t;
  int left = 0;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _calc();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => _calc());
  }

  void _calc() {
    final exp = DateTime.parse(widget.offer['expiresAt'] as String);
    setState(() => left = exp.difference(DateTime.now()).inSeconds.clamp(0, 999));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

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
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(S.t('newJob'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            CircleAvatar(radius: 26, backgroundColor: left < 10 ? Colors.red : brand, child: Text('$left', style: const TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold))),
          ]),
          const SizedBox(height: 8),
          Text('${S.t('youEarn')}: ${rupees(o['earning'] as num)}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: brand)),
          const Divider(),
          Text('${S.t('pickup')}: ${o['pickup']['businessName']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          Text('${o['pickup']['address']} · ${o['distanceToPickupKm']} km'),
          const SizedBox(height: 6),
          Text('${S.t('drop')}: ${o['drop']['area'] ?? ''} · ${o['drop']['distanceKm']} km', style: const TextStyle(fontSize: 18)),
          Text('${parcel['description']} · ${(parcel['weightGrams'] as num) / 1000} kg${parcel['isFragile'] == true ? ' · FRAGILE' : ''}'),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: busy || left == 0 ? null : () => _respond(true), child: Text(S.t('accept'))),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: busy ? null : () => _respond(false), child: Text(S.t('decline'))),
        ]),
      ),
    );
  }
}
