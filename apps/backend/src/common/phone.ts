/** Normalise an Indian mobile number to 10 digits, or return null if invalid. */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  let d = String(input).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
