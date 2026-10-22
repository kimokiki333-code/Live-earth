import { NextResponse } from 'next/server';

export const maxDuration = 10;

/**
 * Maritime reference layer: the world's major ports and shipping
 * chokepoints (curated coordinates — these do not move). Live vessel AIS
 * positions need a keyed AIS feed, so `ships` is honestly empty rather
 * than fabricated; ports/chokepoints are what this layer can truthfully
 * draw today.
 */
const PORTS = [
  { name: 'Port of Shanghai', country: 'China', lat: 31.23, lng: 121.48, type: 'container', rank: 1 },
  { name: 'Port of Singapore', country: 'Singapore', lat: 1.26, lng: 103.82, type: 'container', rank: 2 },
  { name: 'Ningbo-Zhoushan', country: 'China', lat: 29.94, lng: 121.55, type: 'container', rank: 3 },
  { name: 'Shenzhen', country: 'China', lat: 22.55, lng: 114.10, type: 'container', rank: 4 },
  { name: 'Guangzhou', country: 'China', lat: 23.05, lng: 113.52, type: 'container', rank: 5 },
  { name: 'Busan', country: 'South Korea', lat: 35.10, lng: 129.04, type: 'container', rank: 6 },
  { name: 'Rotterdam', country: 'Netherlands', lat: 51.95, lng: 4.14, type: 'container', rank: 7 },
  { name: 'Jebel Ali', country: 'UAE', lat: 25.01, lng: 55.06, type: 'container', rank: 8 },
  { name: 'Los Angeles', country: 'USA', lat: 33.73, lng: -118.26, type: 'container', rank: 9 },
  { name: 'Hamburg', country: 'Germany', lat: 53.54, lng: 9.99, type: 'container', rank: 10 },
  { name: 'Antwerp', country: 'Belgium', lat: 51.22, lng: 4.42, type: 'container', rank: 11 },
  { name: 'Long Beach', country: 'USA', lat: 33.75, lng: -118.21, type: 'container', rank: 12 },
  { name: 'Kaohsiung', country: 'Taiwan', lat: 22.62, lng: 120.30, type: 'container', rank: 13 },
  { name: 'Port Klang', country: 'Malaysia', lat: 3.00, lng: 101.39, type: 'container', rank: 14 },
  { name: 'Xiamen', country: 'China', lat: 24.45, lng: 117.57, type: 'container', rank: 15 },
  { name: 'Algeciras', country: 'Spain', lat: 36.13, lng: -5.43, type: 'container', rank: 39 },
  { name: 'Yokohama', country: 'Japan', lat: 35.44, lng: 139.64, type: 'container', rank: 20 },
  { name: 'New York / New Jersey', country: 'USA', lat: 40.68, lng: -74.02, type: 'container', rank: 21 },
  { name: 'Felixstowe', country: 'United Kingdom', lat: 51.95, lng: 1.31, type: 'container', rank: 24 },
  { name: 'Piraeus', country: 'Greece', lat: 37.94, lng: 23.64, type: 'container', rank: 26 },
  { name: 'Valencia', country: 'Spain', lat: 39.46, lng: -0.33, type: 'container', rank: 27 },
  { name: 'Mersin', country: 'Türkiye', lat: 36.80, lng: 34.63, type: 'container', rank: 30 },
  { name: 'Alexandria', country: 'Egypt', lat: 31.19, lng: 29.89, type: 'container', rank: 31 },
  { name: 'Port Said', country: 'Egypt', lat: 31.26, lng: 32.30, type: 'container', rank: 32 },
  { name: 'Jeddah', country: 'Saudi Arabia', lat: 21.49, lng: 39.17, type: 'container', rank: 33 },
  { name: 'Mumbai (JNPT)', country: 'India', lat: 18.95, lng: 72.95, type: 'container', rank: 34 },
  { name: 'Santos', country: 'Brazil', lat: -23.98, lng: -46.31, type: 'container', rank: 35 },
  { name: 'Durban', country: 'South Africa', lat: -29.87, lng: 31.05, type: 'container', rank: 36 },
  { name: 'Sydney (Botany)', country: 'Australia', lat: -33.97, lng: 151.22, type: 'container', rank: 37 },
  { name: 'Auckland', country: 'New Zealand', lat: -36.84, lng: 174.78, type: 'container', rank: 38 },
];

const CHOKEPOINTS = [
  { name: 'Strait of Malacca', lat: 3.5, lng: 100.5, traffic: '~94,000 transits/yr', risk: 'high' },
  { name: 'Strait of Hormuz', lat: 26.57, lng: 56.25, traffic: '~21% of world petroleum', risk: 'critical' },
  { name: 'Suez Canal', lat: 30.42, lng: 32.34, traffic: '~12% of global trade', risk: 'high' },
  { name: 'Bab el-Mandeb', lat: 12.58, lng: 43.33, traffic: 'Red Sea gateway', risk: 'critical' },
  { name: 'Panama Canal', lat: 9.15, lng: -79.68, traffic: '~14,000 transits/yr', risk: 'medium' },
  { name: 'Turkish Straits (Bosphorus)', lat: 41.12, lng: 29.05, traffic: 'Black Sea gateway', risk: 'high' },
  { name: 'Strait of Gibraltar', lat: 35.97, lng: -5.57, traffic: 'Med–Atlantic gateway', risk: 'medium' },
  { name: 'Dover Strait', lat: 51.0, lng: 1.5, traffic: 'Busiest shipping lane', risk: 'medium' },
  { name: 'Taiwan Strait', lat: 24.5, lng: 119.5, traffic: 'East Asia artery', risk: 'high' },
  { name: 'Danish Straits', lat: 55.5, lng: 12.9, traffic: 'Baltic gateway', risk: 'medium' },
];

export async function GET() {
  return NextResponse.json({ ports: PORTS, chokepoints: CHOKEPOINTS, ships: [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600' },
  });
}
