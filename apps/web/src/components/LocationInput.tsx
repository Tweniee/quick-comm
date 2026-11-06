'use client';
import { useState } from 'react';
import { mapsLink, parseLatLng } from '@/lib/geo';

/** Location pin without a paid maps SDK: paste a Google Maps link / "lat, lng", or use this device's GPS. */
export function LocationInput({ value, onChange, label = 'Location pin' }: { value: { lat?: number; lng?: number }; onChange: (v: { lat: number; lng: number }) => void; label?: string }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  return (
    <label>
      {label}
      <span className="hint">Paste a Google Maps link or "lat, lng". The rider navigates to this pin.</span>
      <div className="row">
        <input style={{ flex: 1, minWidth: 200 }} value={text} placeholder="https://maps.google.com/...@22.72,75.86 or 22.72, 75.86"
          onChange={(e) => {
            setText(e.target.value);
            const p = parseLatLng(e.target.value);
            setErr(p || !e.target.value ? '' : 'Could not read a location from this');
            if (p) onChange(p);
          }} />
        <button type="button" className="secondary" onClick={() => navigator.geolocation?.getCurrentPosition((pos) => {
          const p = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
          setText(`${p.lat}, ${p.lng}`); onChange(p);
        }, () => setErr('Location permission denied'))}>Use my location</button>
      </div>
      {err && <span className="hint" style={{ color: 'var(--bad)' }}>{err}</span>}
      {value.lat != null && <span className="hint">Pin: {value.lat}, {value.lng} · <a href={mapsLink(value.lat, value.lng)} target="_blank" rel="noreferrer">check on map</a></span>}
    </label>
  );
}
