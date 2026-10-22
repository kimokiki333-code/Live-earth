import { NextResponse } from 'next/server';
import { centroidFor } from '@/lib/countryCentroids';

export const maxDuration = 15;

/**
 * Phone-number intelligence from the numbering plan itself
 * (google-libphonenumber — the same library Android uses). No key, no
 * third-party lookup service: validity, format, region and line type are
 * all derivable locally, and the region centroid gives the map a pin.
 */
export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get('number') || '').trim();
  if (!raw) return NextResponse.json({ error: 'A phone number is required' }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('google-libphonenumber');
    const util = lib.PhoneNumberUtil.getInstance();
    const PNF = lib.PhoneNumberFormat;
    const PNT = lib.PhoneNumberType;

    let parsed: any = null;
    try { parsed = util.parseAndKeepRawInput(raw, undefined); } catch { /* fall through to invalid */ }
    if (!parsed) {
      try { parsed = util.parseAndKeepRawInput(raw.startsWith('+') ? raw : `+${raw}`, undefined); } catch { /* invalid */ }
    }
    if (!parsed) {
      return NextResponse.json({ query: raw, valid: false });
    }

    const valid = util.isValidNumber(parsed);
    const regionCode: string | undefined = util.getRegionCodeForNumber(parsed);
    const typeMap: Record<number, string> = {
      [PNT.MOBILE]: 'MOBILE',
      [PNT.FIXED_LINE]: 'FIXED LINE',
      [PNT.FIXED_LINE_OR_MOBILE]: 'FIXED / MOBILE',
      [PNT.VOIP]: 'VOIP',
      [PNT.TOLL_FREE]: 'TOLL FREE',
      [PNT.PREMIUM_RATE]: 'PREMIUM RATE',
      [PNT.PERSONAL_NUMBER]: 'PERSONAL',
      [PNT.UNKNOWN]: 'UNKNOWN',
    };
    let region = regionCode || 'Unknown';
    try {
      const names = new (Intl as any).DisplayNames(['en'], { type: 'region' });
      if (regionCode) region = names.of(regionCode) || regionCode;
    } catch { /* keep code */ }

    const centroid = regionCode ? centroidFor(regionCode) : null;
    return NextResponse.json({
      query: raw,
      valid,
      number: valid ? util.format(parsed, PNF.E164) : undefined,
      international: valid ? util.format(parsed, PNF.INTERNATIONAL) : undefined,
      national: valid ? util.format(parsed, PNF.NATIONAL) : undefined,
      region,
      country_code: regionCode || '',
      calling_code: parsed.getCountryCode ? `+${parsed.getCountryCode()}` : undefined,
      line_type: typeMap[util.getNumberType(parsed)] || 'UNKNOWN',
      ...(centroid ? { lat: centroid[1], lng: centroid[0] } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Phone lookup failed' }, { status: 502 });
  }
}
