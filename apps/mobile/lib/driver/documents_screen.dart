import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/theme.dart';
import 'driver_app.dart';
import 'strings.dart';

/// D14 · Documents. Expiring DL/RC first, with a renewal upload.
class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key, required this.ctx});
  final DriverCtx ctx;
  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  List<Map<String, dynamic>>? docs;
  String? uploading;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final v = await widget.ctx.api.get('/driver/documents') as List;
      if (mounted) setState(() => docs = v.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _renew(Map<String, dynamic> d) async {
    final expiry = await showDatePicker(
      context: context,
      helpText: S.l('New expiry date', 'नई समाप्ति तिथि'),
      initialDate: DateTime.now().add(const Duration(days: 365)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365 * 25)),
    );
    if (expiry == null || !mounted) return;
    final shot = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 70, maxWidth: 1600);
    if (shot == null || !mounted) return;
    setState(() => uploading = d['key'] as String);
    try {
      final r = await widget.ctx.api.upload('/driver/documents/renewal', {'kind': d['renewKind'] as String, 'expiry': expiry.toIso8601String().substring(0, 10)}, shot.path);
      if (mounted) toast(context, (r as Map?)?['message'] as String? ?? S.l('Uploaded', 'अपलोड हो गया'));
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => uploading = null);
    }
  }

  (String, String) _badge(Map<String, dynamic> d) {
    final days = d['daysLeft'] as int?;
    final state = d['state'] as String;
    if (state == 'IN_REVIEW') return (S.l('In review', 'जांच में'), 'ASSIGNING');
    if (state == 'REUPLOAD') return (S.l('Re-upload', 'फिर से अपलोड करें'), 'UNDELIVERED');
    if (state == 'MISSING') return (S.l('Missing', 'नहीं है'), 'UNDELIVERED');
    if (days != null && days < 0) return (S.l('Expired', 'समाप्त'), 'UNDELIVERED');
    if (days != null && days <= 30) return (S.l('$days days left', '$days दिन बाकी'), 'PICKED_UP');
    return (S.l('Valid', 'मान्य'), 'DELIVERED');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(S.l('Documents', 'दस्तावेज़'))),
      body: docs == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(20), children: [
                Text(S.l('Your documents', 'आपके दस्तावेज़'), style: Tw.display(26)),
                const SizedBox(height: 6),
                Text(S.l('Renew before expiry so you are never paused.', 'समाप्ति से पहले नवीनीकरण करें ताकि खाता रुके नहीं।'), style: const TextStyle(color: Tw.muted, fontSize: 15)),
                const SizedBox(height: 16),
                for (final d in docs!) ...[_card(d), const SizedBox(height: 10)],
                const SizedBox(height: 8),
                Notice(S.l('To change Aadhaar or bank details, call support.', 'आधार या बैंक बदलने के लिए सपोर्ट को कॉल करें।')),
              ]),
            ),
    );
  }

  Widget _card(Map<String, dynamic> d) {
    final (label, tone) = _badge(d);
    final days = d['daysLeft'] as int?;
    final canRenew = d['renewKind'] != null && d['state'] != 'IN_REVIEW' && (days == null || days <= 30 || d['state'] == 'REUPLOAD');
    final expires = d['expiresAt'] as String?;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: days != null && days <= 30 ? Tw.warn : Tw.line)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(d['title'] as String, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
          StatusChip(tone, label: label),
        ]),
        if (d['detail'] != null) ...[const SizedBox(height: 4), Text(d['detail'] as String, style: const TextStyle(color: Tw.ink2))],
        if (expires != null) ...[const SizedBox(height: 4), Text('${S.l('Expires', 'समाप्ति')} ${expires.substring(0, 10)}', style: const TextStyle(color: Tw.muted))],
        if (canRenew) ...[
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: uploading != null ? null : () => _renew(d),
            icon: uploading == d['key'] ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.photo_camera_outlined),
            label: Text(S.l('Upload renewed ${d['key']}', 'नया ${d['key']} अपलोड करें')),
          ),
        ],
      ]),
    );
  }
}
