import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tweniee design tokens (same as the web): navy + teal, Inter body, Space Grotesk display.
class Tw {
  static const navy = Color(0xFF0A2540);
  static const navy2 = Color(0xFF13355A);
  static const teal = Color(0xFF00A99D);
  static const tealInk = Color(0xFF00857C);
  static const tealBg = Color(0xFFE0F5F3);
  static const ink = Color(0xFF0F172A);
  static const ink2 = Color(0xFF334155);
  static const muted = Color(0xFF64748B);
  static const faint = Color(0xFF94A3B8);
  static const line = Color(0xFFE2E8F0);
  static const soft = Color(0xFFF1F5F9);
  static const bg = Color(0xFFF8FAFC);
  static const ok = Color(0xFF15803D);
  static const okBg = Color(0xFFDCFCE7);
  static const warn = Color(0xFFB45309);
  static const warnBg = Color(0xFFFEF3C7);
  static const bad = Color(0xFFB91C1C);
  static const badBg = Color(0xFFFEE2E2);
  static const blue = Color(0xFF1D4ED8);
  static const blueBg = Color(0xFFDBEAFE);
  static const violet = Color(0xFF6D28D9);
  static const violetBg = Color(0xFFEDE9FE);
  static const orange = Color(0xFFC2410C);
  static const orangeBg = Color(0xFFFFEDD5);
  static const amber = Color(0xFF7A5200);
  static const amberBg = Color(0xFFFFF1C2);

  static TextStyle display(double size, {Color color = navy, FontWeight weight = FontWeight.w700}) =>
      GoogleFonts.spaceGrotesk(fontSize: size, fontWeight: weight, color: color, height: 1.15);
}

/// Kept for older call sites.
const brand = Tw.teal;

/// High contrast, large tap targets: usable in sunlight, rain, with gloves (masterplan §4.3, §13).
ThemeData appTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: Tw.teal, primary: Tw.tealInk, secondary: Tw.navy, surface: Colors.white),
    scaffoldBackgroundColor: Tw.bg,
  );
  final text = GoogleFonts.interTextTheme(base.textTheme).apply(bodyColor: Tw.ink, displayColor: Tw.navy);
  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(backgroundColor: Tw.navy, foregroundColor: Colors.white, elevation: 0, titleTextStyle: Tw.display(18, color: Colors.white)),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: Tw.teal,
        foregroundColor: Tw.navy,
        disabledBackgroundColor: Tw.line,
        elevation: 0,
        textStyle: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: Tw.navy,
        side: const BorderSide(color: Tw.line, width: 1.5),
        textStyle: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: Tw.tealInk, textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600))),
    cardTheme: CardThemeData(color: Colors.white, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Tw.line))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Tw.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Tw.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Tw.teal, width: 2)),
    ),
    dividerTheme: const DividerThemeData(color: Tw.line, space: 24),
  );
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? Tw.bad : Tw.navy));
}

/// Status colours: same words and colours everywhere (web, apps, tracking).
const _statusColors = <String, List<Color>>{
  'CREATED': [Tw.soft, Tw.muted], 'NO_RIDER': [Tw.soft, Tw.muted], 'CANCELLED': [Tw.soft, Tw.muted],
  'READY': [Tw.blueBg, Tw.blue],
  'ASSIGNING': [Tw.violetBg, Tw.violet], 'ASSIGNED': [Tw.violetBg, Tw.violet],
  'PICKED_UP': [Tw.warnBg, Tw.warn],
  'OUT_FOR_DELIVERY': [Tw.tealBg, Tw.tealInk],
  'ARRIVED': [Tw.amberBg, Tw.amber],
  'DELIVERED': [Tw.okBg, Tw.ok],
  'RETURNING': [Tw.orangeBg, Tw.orange],
  'UNDELIVERED': [Tw.badBg, Tw.bad], 'RETURNED': [Tw.badBg, Tw.bad],
};

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key, this.label});
  final String status;
  final String? label;
  @override
  Widget build(BuildContext context) {
    final c = _statusColors[status] ?? [Tw.soft, Tw.muted];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c[0], borderRadius: BorderRadius.circular(10)),
      child: Text(label ?? status, style: TextStyle(color: c[1], fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }
}

/// The square "T" mark.
class TwLogo extends StatelessWidget {
  const TwLogo({super.key, this.size = 32});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(size / 4), gradient: const LinearGradient(colors: [Tw.navy, Tw.teal], begin: Alignment.topLeft, end: Alignment.bottomRight)),
        child: Text('T', style: Tw.display(size * 0.5, color: Colors.white)),
      );
}

/// EN · हिं pill used on every rider and customer screen.
class LangToggle extends StatelessWidget {
  const LangToggle({super.key, required this.lang, required this.onChanged, this.dark = true});
  final String lang;
  final ValueChanged<String> onChanged;
  final bool dark;
  @override
  Widget build(BuildContext context) {
    Widget b(String code, String label) {
      final on = lang == code;
      return GestureDetector(
        onTap: () => onChanged(code),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(color: on ? (dark ? Colors.white : Tw.navy) : Colors.transparent, borderRadius: BorderRadius.circular(7)),
          child: Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: on ? (dark ? Tw.navy : Colors.white) : (dark ? const Color(0xFFCBD5E1) : Tw.muted))),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(border: Border.all(color: dark ? Tw.navy2 : Tw.line), borderRadius: BorderRadius.circular(9)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [b('en', 'EN'), b('hi', 'हिं')]),
    );
  }
}

/// White card with a small uppercase label, used for PICK UP FROM / DELIVER TO blocks.
class LabeledCard extends StatelessWidget {
  const LabeledCard({super.key, required this.label, required this.children, this.color});
  final String label;
  final List<Widget> children;
  final Color? color;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: color ?? Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: Tw.muted)),
          const SizedBox(height: 6),
          ...children,
        ]),
      );
}

/// Coloured notice strip (warn / bad / ok / info).
class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.tone = 'info', this.action});
  final String text;
  final String tone;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final c = {'warn': [Tw.warnBg, Tw.warn], 'bad': [Tw.badBg, Tw.bad], 'ok': [Tw.okBg, Tw.ok]}[tone] ?? [Tw.soft, Tw.ink2];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: c[0], borderRadius: BorderRadius.circular(12)),
      child: Row(children: [Expanded(child: Text(text, style: TextStyle(color: c[1], fontWeight: FontWeight.w600))), ?action]),
    );
  }
}

/// Small stat tile (Today ₹84 · Jobs 3).
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.dark = false});
  final String label;
  final String value;
  final bool dark;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: dark ? Tw.navy2 : Colors.white, borderRadius: BorderRadius.circular(14), border: dark ? null : Border.all(color: Tw.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 13, color: dark ? const Color(0xFFCBD5E1) : Tw.muted)),
            const SizedBox(height: 4),
            Text(value, style: Tw.display(24, color: dark ? Colors.white : Tw.navy)),
          ]),
        ),
      );
}

/// A tappable row with a chevron: "Earnings & payouts ›".
class LinkRow extends StatelessWidget {
  const LinkRow(this.label, {super.key, required this.onTap, this.icon});
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: Tw.line)),
            child: Row(children: [
              if (icon != null) ...[Icon(icon, color: Tw.tealInk), const SizedBox(width: 12)],
              Expanded(child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
              const Icon(Icons.chevron_right, color: Tw.faint),
            ]),
          ),
        ),
      );
}
