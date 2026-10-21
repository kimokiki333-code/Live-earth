export interface CachedSatellite {
  name: string;
  line1: string;
  line2: string;
  [key: string]: unknown;
}

let sats: CachedSatellite[] = [];
let time = 0;

export function setSatelliteCache(next: CachedSatellite[]) {
  sats = next;
  time = Date.now();
}

export function getSatelliteCache() {
  return { sats, time };
}
