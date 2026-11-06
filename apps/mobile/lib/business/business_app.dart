import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'order_screens.dart';
import 'wallet_screens.dart';

final bizApi = Api('business');

Future<void> openWeb(String path) => launchUrl(Uri.parse('$kWebUrl$path'), mode: LaunchMode.externalApplication);

Future<T?> push<T>(BuildContext context, Widget page) => Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));

String greeting() {
  final h = DateTime.now().hour;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const sectionLabel = TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: Tw.muted);

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
        debugShowCheckedModeBanner: false,
        title: 'Tweniee Business',
        theme: appTheme(),
        home: loading ? const Scaffold(body: Center(child: CircularProgressIndicator())) : bizApi.isLoggedIn ? const BizShell() : const BizLogin(),
      );
}

/// B02 · Log in. Signup (B01–B04) runs on the web portal, where KYC uploads live.
class BizLogin extends StatefulWidget {
  const BizLogin({super.key});
  @override
  State<BizLogin> createState() => _BizLoginState();
}

class _BizLoginState extends State<BizLogin> {
  final login = TextEditingController();
  final pw = TextEditingController();
  bool busy = false;

  Future<void> _go() async {
    setState(() => busy = true);
    try {
      final r = await bizApi.post('/auth/business/login', {'login': login.text.trim(), 'password': pw.text});
      await bizApi.setToken(r['token'] as String);
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const BizShell()));
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Tw.navy,
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 48, 24, 24), children: [
            const Row(children: [TwLogo(size: 40)]),
            const SizedBox(height: 28),
            Text('Same-day delivery for your shop', style: Tw.display(30, color: Colors.white)),
            const SizedBox(height: 8),
            const Text('Riders pick up from your counter. You pay from a prepaid wallet, only for orders a rider accepts.', style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 15, height: 1.4)),
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Log in', style: Tw.display(22)),
                const SizedBox(height: 16),
                TextField(controller: login, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Phone or email')),
                const SizedBox(height: 12),
                TextField(controller: pw, obscureText: true, onSubmitted: (_) => _go(), decoration: const InputDecoration(labelText: 'Password')),
                const SizedBox(height: 20),
                ElevatedButton(onPressed: busy ? null : _go, child: Text(busy ? 'Logging in…' : 'Log in')),
              ]),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => openWeb('/business/signup'),
              child: const Text('New business? Sign up and get verified', style: TextStyle(color: Color(0xFF5EEAD4))),
            ),
          ]),
        ),
      );
}

/// Bottom navigation: Home · Orders · Wallet · More.
class BizShell extends StatefulWidget {
  const BizShell({super.key});
  @override
  State<BizShell> createState() => _BizShellState();
}

class _BizShellState extends State<BizShell> {
  int tab = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(index: tab, children: [
          BizHome(onTab: (i) => setState(() => tab = i)),
          const OrdersList(),
          const WalletScreen(),
          const MoreScreen(),
        ]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          backgroundColor: Colors.white,
          indicatorColor: Tw.tealBg,
          onDestinationSelected: (i) => setState(() => tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home, color: Tw.tealInk), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2, color: Tw.tealInk), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet, color: Tw.tealInk), label: 'Wallet'),
            NavigationDestination(icon: Icon(Icons.menu), label: 'More'),
          ],
        ),
      );
}

const orderHint = {'CREATED': 'Pack it, then mark Ready', 'READY': 'Looking for a rider', 'ASSIGNING': 'Looking for a rider', 'NO_RIDER': 'No rider yet · retry', 'ARRIVED': 'Rider at the door'};
const _tiles = [
  ('Ready', ['READY', 'ASSIGNING', 'NO_RIDER'], Tw.blue),
  ('Assigned', ['ASSIGNED'], Tw.violet),
  ('Picked', ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'], Tw.warn),
  ('Delivered', ['DELIVERED'], Tw.ok),
  ('Returned', ['UNDELIVERED', 'RETURNING', 'RETURNED'], Tw.bad),
];

/// B06 · Home, or B05 · Under review.
class BizHome extends StatefulWidget {
  const BizHome({super.key, required this.onTab});
  final ValueChanged<int> onTab;
  @override
  State<BizHome> createState() => _BizHomeState();
}

class _BizHomeState extends State<BizHome> {
  Map<String, dynamic>? me, wallet, today;
  List orders = [];
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
    final n = DateTime.now();
    final from = DateTime(n.year, n.month, n.day).toUtc().toIso8601String();
    try {
      final r = await Future.wait([
        bizApi.get('/business/me'),
        bizApi.get('/business/wallet'),
        bizApi.get('/business/orders/today'),
        bizApi.get('/business/orders?from=${Uri.encodeComponent(from)}&take=50'),
      ]);
      if (mounted) {
        setState(() {
          me = r[0] as Map<String, dynamic>;
          wallet = r[1] as Map<String, dynamic>;
          today = r[2] as Map<String, dynamic>;
          orders = (r[3] as Map)['items'] as List;
        });
      }
    } catch (_) {}
  }

  Future<void> _openOrder(String id) async {
    await push(context, OrderDetail(id: id));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final b = me;
    if (b == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (b['status'] == 'PENDING') return _underReview(b);
    final w = wallet;
    final approved = b['status'] == 'APPROVED';
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(greeting(), style: const TextStyle(color: Tw.muted)),
                Text(b['name'] as String? ?? '', style: Tw.display(24)),
              ])),
              GestureDetector(
                onTap: () => widget.onTab(2),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(color: Tw.navy, borderRadius: BorderRadius.circular(12)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    const Text('Wallet', style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 12)),
                    Text(rupees(w?['available'] as num?), style: Tw.display(18, color: Colors.white)),
                  ]),
                ),
              ),
            ]),
            const SizedBox(height: 16),
            if (b['status'] == 'REJECTED') ...[Notice('Verification was not approved: ${b['statusReason'] ?? ''}', tone: 'bad'), const SizedBox(height: 12)],
            if (b['status'] == 'SUSPENDED') ...[Notice('Your account is paused: ${b['statusReason'] ?? ''}. New orders are blocked; live orders continue.', tone: 'bad'), const SizedBox(height: 12)],
            if (approved && w?['lowBalance'] == true) ...[
              Notice('Low balance. New orders need ${rupees(w?['requiredToCreate'] as num?)} available.', tone: 'warn',
                  action: TextButton(onPressed: () => push(context, const RechargeScreen()).then((_) => _load()), child: const Text('Recharge'))),
              const SizedBox(height: 12),
            ],
            if (approved)
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                onPressed: () async {
                  await push(context, const CreateOrder());
                  _load();
                },
                label: Text('New delivery · ${rupees(w?['deliveryFee'] as num?)}'),
              ),
            const SizedBox(height: 16),
            Row(children: [
              for (final (i, t) in _tiles.indexed) ...[
                if (i > 0) const SizedBox(width: 6),
                Expanded(child: _tile(t.$1, t.$2.fold<int>(0, (s, k) => s + ((today?[k] as num?)?.toInt() ?? 0)), t.$3)),
              ],
            ]),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(child: Text("Today's orders", style: Tw.display(18))),
              TextButton(onPressed: () => widget.onTab(1), child: Text('${orders.length} total · all orders')),
            ]),
            const SizedBox(height: 4),
            if (orders.isEmpty) const Notice('No orders yet today.'),
            for (final o in orders) ...[OrderRow(o as Map<String, dynamic>, onTap: () => _openOrder(o['id'] as String)), const SizedBox(height: 8)],
            const SizedBox(height: 8),
            const Text('We never promise a delivery time. Inside the city deliveries usually take 30 to 70 minutes from Ready.', style: TextStyle(color: Tw.muted, fontSize: 13)),
          ]),
        ),
      ),
    );
  }

  Widget _tile(String label, int n, Color color) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Tw.line)),
        child: Column(children: [
          Text('$n', style: Tw.display(20, color: color)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Tw.muted)),
        ]),
      );

  Widget _underReview(Map<String, dynamic> b) {
    final steps = [
      ('Account and contact verified', b['phoneVerifiedAt'] != null && b['emailVerifiedAt'] != null),
      (b['gstin'] != null ? 'GSTIN saved for the express check' : 'Documents uploaded', b['submittedAt'] != null),
      ('Staff check: shop and address', false),
      ('Wallet unlocks after approval', false),
    ];
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Tw.navy, borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text("We're verifying ${b['name']}", style: Tw.display(24, color: Colors.white)),
                const SizedBox(height: 8),
                const Text("Express checks usually clear in minutes. Manual checks take 1–2 business days. We'll SMS and email you.", style: TextStyle(color: Color(0xFFCBD5E1), height: 1.4)),
              ]),
            ),
            const SizedBox(height: 16),
            if (b['submittedAt'] == null) ...[
              Notice('Finish signup on the website to send your documents.', tone: 'warn', action: TextButton(onPressed: () => openWeb('/business/signup'), child: const Text('Open'))),
              const SizedBox(height: 12),
            ],
            LabeledCard(label: 'Progress', children: [
              for (final (s, done) in steps)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(children: [
                    Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, color: done ? Tw.ok : Tw.faint, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Text(s, style: TextStyle(fontWeight: done ? FontWeight.w700 : FontWeight.w400, color: done ? Tw.ink : Tw.muted))),
                  ]),
                ),
            ]),
            const SizedBox(height: 12),
            const LabeledCard(label: "Until you're approved", children: [
              Padding(padding: EdgeInsets.symmetric(vertical: 4), child: Row(children: [Expanded(child: Text('Create order')), StatusChip('CANCELLED', label: 'Locked')])),
              Padding(padding: EdgeInsets.symmetric(vertical: 4), child: Row(children: [Expanded(child: Text('Recharge wallet')), StatusChip('CANCELLED', label: 'Locked')])),
            ]),
            const SizedBox(height: 12),
            const Text("If rejected, you'll see the reason and can re-apply once with corrected documents.", style: TextStyle(color: Tw.muted, fontSize: 13)),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: () => push(context, const SupportScreen()), child: const Text('Contact support')),
          ]),
        ),
      ),
    );
  }
}

/// One order in a list: "Priya · Kurta set" with the status chip.
class OrderRow extends StatelessWidget {
  const OrderRow(this.o, {super.key, required this.onTap});
  final Map<String, dynamic> o;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final rider = o['rider'] as Map<String, dynamic>?;
    final landmark = o['customer']['landmark'] as String?;
    final what = rider != null ? 'Rider ${rider['firstName']}' : orderHint[o['status']] ?? statusLabel[o['status']] ?? o['status'];
    final sub = '${o['code']} · $what${landmark != null && landmark.isNotEmpty ? ' · $landmark' : ''}';
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text('${o['customer']['name']} · ${o['parcel']['description']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
              const SizedBox(width: 8),
              StatusChip(o['status'] as String, label: statusLabel[o['status']]),
            ]),
            const SizedBox(height: 4),
            Text(sub, style: const TextStyle(color: Tw.muted, fontSize: 13)),
          ]),
        ),
      ),
    );
  }
}

/// All orders with search and a status filter.
class OrdersList extends StatefulWidget {
  const OrdersList({super.key});
  @override
  State<OrdersList> createState() => _OrdersListState();
}

class _OrdersListState extends State<OrdersList> {
  static const filters = {
    'All': '',
    'Live': 'CREATED,READY,ASSIGNING,ASSIGNED,PICKED_UP,OUT_FOR_DELIVERY,ARRIVED',
    'No rider': 'NO_RIDER',
    'Delivered': 'DELIVERED',
    'Returns': 'UNDELIVERED,RETURNING,RETURNED',
    'Cancelled': 'CANCELLED',
  };
  String filter = 'All';
  final q = TextEditingController();
  List items = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      final s = filters[filter]!;
      final search = q.text.trim();
      final r = await bizApi.get('/business/orders?take=100${s.isNotEmpty ? '&status=$s' : ''}${search.isNotEmpty ? '&search=${Uri.encodeComponent(search)}' : ''}');
      if (mounted) setState(() => items = (r as Map)['items'] as List);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Orders')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            TextField(controller: q, textInputAction: TextInputAction.search, onSubmitted: (_) => _load(), decoration: const InputDecoration(hintText: 'Order code, customer phone or name', prefixIcon: Icon(Icons.search))),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final f in filters.keys)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(f),
                      selected: filter == f,
                      showCheckmark: false,
                      selectedColor: Tw.navy,
                      labelStyle: TextStyle(color: filter == f ? Colors.white : Tw.ink2, fontWeight: FontWeight.w600),
                      onSelected: (_) {
                        setState(() => filter = f);
                        _load();
                      },
                    ),
                  ),
              ]),
            ),
            const SizedBox(height: 12),
            if (loading && items.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
            if (!loading && items.isEmpty) const Notice('No orders match.'),
            for (final o in items) ...[
              OrderRow(o as Map<String, dynamic>, onTap: () async {
                await push(context, OrderDetail(id: o['id'] as String));
                _load();
              }),
              const SizedBox(height: 8),
            ],
          ]),
        ),
      );
}

/// More: branches, team, support, API, log out.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('More')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          LinkRow('Branches & team', icon: Icons.storefront_outlined, onTap: () => push(context, const BranchesScreen())),
          const SizedBox(height: 8),
          LinkRow('Support', icon: Icons.support_agent, onTap: () => push(context, const SupportScreen())),
          const SizedBox(height: 8),
          LinkRow('API access', icon: Icons.code, onTap: () => openWeb('/business/api')),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            icon: const Icon(Icons.logout),
            label: const Text('Log out'),
            onPressed: () async {
              await bizApi.setToken(null);
              if (context.mounted) Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const BizLogin()), (_) => false);
            },
          ),
        ]),
      );
}

/// B17 · Branches & team. Read here; adding branches and inviting staff happen on the web.
class BranchesScreen extends StatefulWidget {
  const BranchesScreen({super.key});
  @override
  State<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends State<BranchesScreen> {
  Map<String, dynamic>? me;
  @override
  void initState() {
    super.initState();
    bizApi.get('/business/me').then((v) {
      if (mounted) setState(() => me = v as Map<String, dynamic>);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Branches & team')),
        body: me == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                const Text('PICKUP BRANCHES', style: sectionLabel),
                const SizedBox(height: 8),
                for (final a in (me!['addresses'] as List? ?? []))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: LabeledCard(label: '${a['label']}${a['isDefault'] == true ? ' · default' : ''}', children: [
                      Text('${a['address'] ?? ''}${a['pincode'] != null ? ' · ${a['pincode']}' : ''}', style: const TextStyle(fontSize: 15)),
                      if (a['landmark'] != null) Text('${a['landmark']}', style: const TextStyle(color: Tw.muted)),
                    ]),
                  ),
                const SizedBox(height: 8),
                const Notice('All branches share one wallet. Add a branch or invite staff on the web portal.'),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => openWeb('/business/branches'), child: const Text('Manage on the web')),
              ]),
      );
}

/// B18 · Support. Raise a ticket, see your tickets.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key, this.orderCode, this.type});
  final String? orderCode;
  final String? type;
  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  static const topics = {
    'WHERE_IS_MY_PARCEL': 'Where is my parcel?',
    'WALLET_DISPUTE': 'Why was I charged?',
    'NO_RIDER': 'No rider available',
    'LOSS_DAMAGE': 'Parcel lost or damaged',
  };
  late String type = topics.containsKey(widget.type) ? widget.type! : 'WHERE_IS_MY_PARCEL';
  late final order = TextEditingController(text: widget.orderCode ?? '');
  final msg = TextEditingController();
  List tickets = [];
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await bizApi.get('/business/tickets');
      if (mounted) setState(() => tickets = r is List ? r : (r as Map)['items'] as List? ?? []);
    } catch (_) {}
  }

  Future<void> _send() async {
    if (msg.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      final code = order.text.trim();
      await bizApi.post('/business/tickets', {'type': type, 'subject': '${topics[type]}${code.isNotEmpty ? ' · $code' : ''}', 'body': msg.text.trim(), if (code.isNotEmpty) 'orderId': code});
      msg.clear();
      if (mounted) toast(context, 'Sent. Support will reply here.');
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Support')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          if (kSupportPhone.isNotEmpty) ...[
            ElevatedButton.icon(onPressed: () => launchUrl(Uri.parse('tel:$kSupportPhone')), icon: const Icon(Icons.call), label: const Text('Call support')),
            const SizedBox(height: 16),
          ],
          Text('How can we help?', style: Tw.display(20)),
          const SizedBox(height: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final e in topics.entries)
              ChoiceChip(
                label: Text(e.value),
                selected: type == e.key,
                showCheckmark: false,
                selectedColor: Tw.navy,
                labelStyle: TextStyle(color: type == e.key ? Colors.white : Tw.ink2, fontWeight: FontWeight.w600),
                onSelected: (_) => setState(() => type = e.key),
              ),
          ]),
          const SizedBox(height: 12),
          TextField(controller: order, decoration: const InputDecoration(labelText: 'Order code (optional)')),
          const SizedBox(height: 10),
          TextField(controller: msg, maxLines: 4, decoration: const InputDecoration(labelText: 'What happened?')),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: busy ? null : _send, child: const Text('Send')),
          const SizedBox(height: 8),
          const Text('Need a GST invoice for a recharge? Ask here and we will email it.', style: TextStyle(color: Tw.muted, fontSize: 13)),
          const SizedBox(height: 20),
          if (tickets.isNotEmpty) ...[
            const Text('YOUR TICKETS', style: sectionLabel),
            const SizedBox(height: 8),
            for (final t in tickets)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: LabeledCard(label: '${t['status'] ?? ''}', children: [Text('${t['subject'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600))]),
              ),
          ],
        ]),
      );
}
