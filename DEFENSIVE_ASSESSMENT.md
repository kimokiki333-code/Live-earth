# Badr Live Earth — Defensive Assessment model

## What this product is
An on-demand, defensive assessment of **public assets you own** (domains and
their web/DNS/TLS posture), using the ARAGOS v3.0 module engine imported from
`args-luna@new101`.

## What it is not
- Not a "% secure" score or a security guarantee.
- Not live/continuous device monitoring.
- Not connected to IntelX, Sherlock, or any account/OSINT backend.
- Not a scanner for other people's systems, localhost, or private networks.

## The checklist (evidence coverage)
`GET /api/assessment/checklist` returns these areas; a scan "covers" an area
when at least one completed module matches it:

1. DNS & email authentication (DNS/DNSSEC, SPF/DKIM/DMARC)
2. TLS & certificate health (chain, expiry, versions/ciphers)
3. HTTP security hardening (headers, CSP, CORS, cookies)
4. Exposed services & ports (inventory of owned assets)
5. Attack-surface inventory (subdomains, exposed files/buckets)
6. Web application hygiene (stack/CMS, crawl, JS checks)
7. Reputation & threat intelligence
8. Privacy & responsible disclosure (security.txt, contacts, GDPR signals)

`coverage_percent = covered areas / 8`. More coverage means more evidence —
never more "guaranteed security."

## Enforcement (server-side, in `server.py`)
- `POST /api/scan/run` requires `authorized: true` (+ optional note) → else 403.
- Localhost / private / reserved targets → 400 (`validate_defensive_target`,
  including DNS-resolution checks).
- Web UI requires the attestation checkbox; web CLI requires `authorize`.
- Every scan record stores `attestation` and `assessment`; exports restate
  the disclaimer.

## Guidance
Re-run after fixes to grow evidence and close findings; treat ALERT/WARN
findings as a remediation backlog, prioritized by the AI analyst or manually.
