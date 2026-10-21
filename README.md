# Badr Live Earth — Defensive Assessment Platform

**A defensive, authorized-only security assessment platform for your own assets** —
Glassmorphism web UI, interactive Three.js background, 151 assessment modules, and an
optional Ollama local/cloud AI analyst for remediation guidance.

> Built by merging [ARAGOS v3.0](https://github.com/kimokiki333-code/args-luna/tree/new101)
> (`args-luna@new101`, formerly Argus) into this repository as the assessment engine,
> and reframing it from an offensive recon tool into the **Badr Live Earth defensive
> assessment** product described in the original milestone notes below.

---

## ⚠️ Read this first — scope & the gauge

- **Authorized targets only.** Before any scan runs, the operator must tick
  *“I own this target / I am authorized to assess it”* in the UI (or send
  `authorized: true` to the API / type `authorize <note>` in the web CLI).
  The server rejects un-attested scans with HTTP 403.
- **Public targets only.** Localhost and private / loopback / link-local /
  reserved addresses (including hostnames that resolve to them) are blocked
  server-side with HTTP 400 — this build must not be usable as an
  internal-network scanner.
- **The gauge is evidence coverage, not “% secure.”** The headline number shows
  how much of the defensive checklist (DNS & email auth, TLS health, HTTP
  hardening, exposed services, attack-surface inventory, web hygiene, threat
  intel, privacy/disclosure) has at least one completed module run as evidence.
  *It is not a percentage guarantee that a device is secure.*
- **Not live monitoring, no IntelX/Sherlock backend.** Scans are on-demand
  point-in-time assessments. Nothing here continuously monitors a device, and
  no IntelX/Sherlock service is connected.
- Original milestone note, still true: *“Test the ZIP locally before using it
  as the main project build.”* The upstream ZIPs were **not** copied into this
  repo (they duplicate the source); build/run from source as below.

Full details: [DEFENSIVE_ASSESSMENT.md](DEFENSIVE_ASSESSMENT.md)

## Quick start

```bash
pip install -r requirements.txt
python3 server.py            # http://localhost:8000  (PORT env to change)
```

1. Open the UI, enter a **public domain you own** (default demo: `example.com`).
2. Tick the authorization attestation and add a scope note.
3. Pick modules (or a sweep) and **Run Assessment**.
4. Read the checklist evidence coverage, review findings, export MD/JSON/CSV/TXT.

CLI (upstream Argus shell, preserved):

```bash
python -m argus              # interactive CLI; same module catalog
```

Docker (upstream):

```bash
docker build -t badr-live-earth .
docker run -p 8000:8000 badr-live-earth
```

## API (defensive additions in **bold**)

| Endpoint | Description |
|---|---|
| `GET /api/health` | Service health, gauge semantics & disclaimer |
| `GET /api/status` | Module counts, severity totals, **checklist coverage so far** |
| **`GET /api/assessment/checklist`** | **Defensive checklist + evidence coverage + scope policy** |
| `GET /api/modules` | The 151-module catalog (`?section=&tag=&q=`) |
| `POST /api/scan/run` | Run an assessment — **requires `authorized: true`**; private/local targets → 400 |
| `GET /api/scans`, `GET /api/scans/{id}` | Scan history / detail (includes `assessment` + `attestation`) |
| `GET /api/scans/{id}/export/{md,json,csv,txt}` | Reports (include the coverage disclaimer) |
| `POST /api/ai/chat`, `POST /api/ai/analyze` | Optional Ollama local/cloud AI analyst (works offline via built-in synthesis) |
| `POST /api/cli/exec` | Web CLI — `authorize <note>` is required before `run`/`runall` |

Example:

```bash
curl -X POST localhost:8000/api/scan/run -H 'Content-Type: application/json' -d '{
  "target": "example.com", "module_ids": ["3","12","115"],
  "authorized": true, "authorization_note": "my own domain"
}'
```

## Provenance & what changed in the merge

- **Imported:** all source from `args-luna` branch `new101` (commit `de91ba4`):
  the 151 module scripts, `server.py` (FastAPI), `index.html` + `static/`
  (and `web/` mirror), `cli/`, `core/`, `config/`, `utils/`, Docker/Vercel files.
- **Not imported:** the three upstream ZIP archives (binary duplicates of the
  same source) and `.git`.
- **Changed for Badr Live Earth:** product branding in UI/API/reports; the
  authorization gate + private-target blocking; the defensive checklist &
  evidence-coverage gauge (`GET /api/assessment/checklist`, `assessment` on
  every scan record); safe demo default target (`example.com`); exports carry
  the “coverage ≠ % secure” disclaimer; tests under `tests/`.
- **Preserved:** the module engine, Ollama hybrid AI, Three.js scenes, web CLI,
  export formats, and the upstream CLI.

## Legal

For educational use and assessment of systems you own or are explicitly
authorized to test only. You are solely responsible for your use. Upstream
license: see [LICENSE](LICENSE).

## Original milestone notes (Badr Live Earth — Defensive Assessment Milestone v2)

- The assessment gauge measures checklist evidence coverage; it is not a
  percentage guarantee that a device is secure.
- Do not treat this milestone as live device monitoring or as a connected
  IntelX/Sherlock backend.
- Test the build locally before using it as the main project build.
