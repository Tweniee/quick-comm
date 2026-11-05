/** Extract lat/lng from a pasted Google Maps link or "lat, lng" text. */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const s = decodeURIComponent(input.trim());
  const patterns = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

export function mapsLink(lat?: number | null, lng?: number | null) {
  return lat != null && lng != null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : undefined;
}
