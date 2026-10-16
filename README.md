# Open Sentinel — Intelligence & Security Center

Standalone defensive security workspace, separate from BaDR AI Arsenal.

## Current milestone
- Cinematic startup transition and responsive command-center UI.
- Approximate public-IP geolocation with map recentering.
- Passive RDAP lookup for public domain/IP registration.
- Passive URLhaus lookup for known malicious URL/host indicators.
- Browser-local file details and SHA-256; JPEG EXIF marker detection (detailed GPS/camera decoding is not enabled yet).
- Defensive readiness checklist with evidence-coverage score, not a security guarantee.
- Provider status, errors, timestamps, and limitations are displayed.

## Deploy
Import this repository into Vercel and deploy branch `build/standalone-security-center`. No npm build step is required. The API routes in `api/` need a serverless host such as Vercel. A GitHub branch alone does not create a deployment.

## Not yet integrated
Osiris/NADIR map and threat pipeline, username/email OSINT adapters, local Sherlock/User Scanner, Argus tools, capa, Android APK scanning, endpoint telemetry, IntelX, and other credentialed sources. They require real adapters and testing; source archives placed in a folder do not integrate themselves.

## Boundaries
IP location is approximate network geolocation, not GPS. URLhaus is one feed and a no-match is not proof of safety. A browser cannot inspect the whole PC or all inbound connections; that needs an authorized endpoint agent. Credentials are never bypassed and must be stored server-side. Active checks should only target systems you own or are authorized to assess.

## Test status
Files are added on a separate branch. Provider requests, browser rendering, Vercel deployment, and upstream integration have not yet been verified end-to-end.