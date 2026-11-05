/** Split a leg fee into driver share and platform share. Driver share rounds down to whole paise; platform gets the rest, so the two always add up. */
export function splitFee(feePaise: number, driverSharePct: number): { driver: number; platform: number } {
  const driver = Math.floor((feePaise * driverSharePct) / 100);
  return { driver, platform: feePaise - driver };
}

export const rupees = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
