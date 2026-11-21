# CivicLens - AI triage for citizen complaints (Bengaluru, Karnataka pilot)

CivicLens is a prototype civic-issue reporting platform. Citizens report problems such as potholes, overflowing bins,
water leaks, broken streetlights, fallen trees and open manholes. The system classifies each report, proposes a severity
and a responsible department, helps officers prioritise, lets field workers upload before/after evidence, and lets a
supervisor verify the resolution before the citizen is thanked.

It is a pilot/prototype for **Greater Bengaluru** (Karnataka, India). It is **not** an emergency service and it is **not**
connected to any real municipal system. All seeded people, complaints, vehicles and bins are fictional and labelled
"Demo data" / "Simulated".

* Full behaviour specification: [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md)
* Interfaces and endpoint list (source of truth for the API): [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
* Architecture and data flow: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
* Deployment guide (Render + Vercel + MongoDB Atlas): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
* Importing official boundary data: [`docs/BOUNDARIES.md`](docs/BOUNDARIES.md)
* 3D "City in Motion" addendum: [`docs/CITY_TWIN_CONTRACT.md`](docs/CITY_TWIN_CONTRACT.md)

**Live (free hosting):** website <https://acharyap2p.vercel.app> - API <https://acharyap2p.onrender.com> (interactive docs at
`/docs`, health at `/health`). The API sleeps when nobody uses it, so the first visit after a pause shows a
"Waking up the server" card for about 30 to 60 seconds (see [Free-tier wake-up](#free-tier-wake-up-card)).

## Contents

1. [Quick start for a visitor](#quick-start-for-a-visitor) - report something in two minutes
2. [What you can report](#what-you-can-report)
3. [Features](#features) and [How a report travels](#how-a-report-travels)
4. [Civic reward](#civic-reward-500-for-every-10-resolved-reports) and [Photo must match the report](#photo-must-match-the-report)
5. [Roles](#roles) and [How to sign in](#how-to-sign-in-local-and-deployed) (admin, staff, demo accounts, Google)
6. [Tech stack](#tech-stack) and [Architecture](#architecture-short)
7. [Local setup](#local-setup), [Tests](#tests), [Environment variables](#environment-variables)
8. [Deployment](#deployment-summary) and the [deployed instance checklist](#deployed-instance-checklist)
9. [Troubleshooting](#troubleshooting), [Known limitations](#known-limitations--not-verified), [What changed recently](#what-changed-recently)

## Quick start for a visitor

1. Open <https://acharyap2p.vercel.app>. If a "Waking up the server" card appears, wait for it to finish (free hosting).
2. Press **Register** (email and password, or **Continue with Google**), or sign in with a demo account
   (see [How to sign in](#how-to-sign-in-local-and-deployed)).
3. Press **Report an issue** and follow the five steps: **Describe** (type, speak, or add a photo) -> **Location** (GPS, search or
   a pin on the map) -> **Nearby reports** (we check for duplicates) -> **AI review** (category, severity and department are
   suggested) -> **Submit**.
4. Follow it under **My reports**. When a supervisor verifies the fix you get a certificate and points, and every 10 resolved
   reports earns a cash-value [civic reward](#civic-reward-500-for-every-10-resolved-reports).

## What you can report

Every category is routed to the department that normally handles it (starting rules from the specification; verify before real use).

| Category | Examples | Routed to |
|---|---|---|
| Roads | pothole, damaged road, broken footpath | Road Maintenance (Engineering) |
| Waste | overflowing bin, litter / dumping, missed collection | Solid Waste & Sanitation |
| Water & Sewerage | pipe leak, water shortage, contaminated supply, sewage overflow, sewer blockage | BWSSB - Water & Sewerage |
| Electricity | broken streetlight, exposed / fallen wire, power outage, damaged electrical asset | Electrical (streetlights) or BESCOM (network faults) |
| Trees & Parks | fallen tree, dangerous branch, park maintenance | Parks and Horticulture |
| Drainage | blocked storm drain, road flooding, open roadside drain, open manhole | Stormwater Drain / Engineering |
| Public infrastructure | damaged bench, bus shelter, public toilet, other public asset | Public Works / Assets |
| Other / unclear | anything the system cannot place | Municipal Triage Queue (a person decides) |

You can describe the problem in Kannada, English, Hindi, Tamil, Telugu or Malayalam, by typing, by speaking (voice is
transcribed and added to the description automatically so you can continue straight away), or with up to four photos.

## Features

Described in detail in `docs/API_CONTRACT.md` (exact request/response shapes). Items marked *(new)* were added most recently.

**For citizens**

* **Reporting** - text, voice (OpenAI transcription; the transcript is placed in the editable description automatically) and up to
  a configurable number of photos; GPS / map pin / address search; duplicate check against nearby reports; an AI review step
  before submitting; six languages (Kannada, English, Hindi, Tamil, Telugu, Malayalam).
* **Sign-in** - email + password, or **Continue with Google** (sign-in and sign-up; Google sign-up always creates a citizen).
  An account created with Google can add a password later under **Profile** so it can also use the password form.
* **My reports** - live status timeline, evidence, follow other people's reports, ask for a reopen.
* **Recognition** - certificates of appreciation (PDF with QR code and a public verification page), civic points, achievements,
  Growing City, and two games (Clean City Challenge, Civic Quiz Arena).
* **Civic reward** *(new)* - INR 500 for every 10 of your own reports that are resolved and verified
  ([details](#civic-reward-500-for-every-10-resolved-reports)).
* **Photo must match the report** *(new)* - a photo that clearly does not show the described problem is refused
  ([details](#photo-must-match-the-report)).
* **CleanRoute** - SIMULATED garbage trucks and bin fill levels with a live WebSocket feed. The routes follow real roads
  (snapped at startup through OSRM / OpenStreetMap data; labelled when they could not be snapped) and are long loops of roughly
  20 to 35 km across Bengaluru.
* **City in Motion (3D)** - route `/city-in-motion`: MapLibre GL map with extruded, height-coloured 3D buildings (OpenFreeMap,
  no API key), complaint pillars, bin towers, simulated trucks (Three.js), routes and a list view. It is a visual layer over the
  SAME FastAPI data (`/api/v1/city-twin/*`, WebSocket `/ws/v1/city-twin/live`), not a separate app.

**For staff**

* **AI triage** - OpenAI first, Ollama as backup, deterministic multilingual keyword rules as the last resort. The model only
  proposes category, summary and factor scores; severity, escalation and routing are deterministic and officers can override them
  (every override is audited).
* **Command centre** - prioritised queue, dashboard, analytics, classification / assignment, status workflow with immutable
  history, internal vs public notes, duplicate linking, SLA (sample targets) and priority scoring.
* **Resolution workflow** - workers upload before/after evidence; only a supervisor or admin can mark a ticket `resolved`
  (verify-resolution); reopen requests are decided by a supervisor.
* **Admin console** - users, configuration (departments, categories, routing rules, SLA, settings), **Rewards** *(new)*,
  audit log, and removal of demo data.

**Platform**

* **Duplicate detection** (distance + text similarity, no PostGIS), **service-area check** (official boundaries when imported,
  otherwise a clearly flagged coarse fallback).
* **Free-tier wake-up card** *(new)* - a friendly animated card while the sleeping backend boots
  ([details](#free-tier-wake-up-card)).
* **Demo logins in production** *(new)* - ready-made accounts for every role, even on the deployed site
  ([details](#how-to-sign-in-local-and-deployed)).
* **Demo data** - optional seeder with fictional accounts and about 26 complaints, vehicles and bins (off by default).

## How a report travels

```
citizen submits  ->  duplicate check  ->  AI triage (+ photo-vs-text check)  ->  routed to a department  ->  officer verifies
-> supervisor/admin assigns / worker fixes + uploads "after" evidence -> supervisor VERIFIES -> status "resolved"
-> certificate + points for the reporter -> every 10th resolved report -> civic reward recorded -> admin hands it over
```

* Browser-supplied category, severity and department are never trusted: they come from triage and routing on the server.
* `resolved` is reachable **only** through verify-resolution by a supervisor or admin. Certificates, points and rewards are
  issued only for resolved **and** verified reports.
* Triage runs *before* a ticket number is created, so a refused report (for example a mismatching photo) leaves no empty ticket.

## Civic reward: 500 for every 10 resolved reports

A citizen earns **INR 500 for every 10 of their own reports that are resolved and verified** by a supervisor or admin.

| Rule | Detail |
|---|---|
| What counts | Reports **you created** whose status is `resolved` and that a supervisor/admin verified |
| What does not count | Open, rejected or duplicate-linked reports; reports you only followed or added evidence to |
| How blocks work | Reports are counted in order of resolution. The 10th resolved report earns reward #1, the 20th reward #2, and so on. A report is never counted twice |
| When it is granted | Automatically at the moment the 10th report is verified (same step that issues the certificate). You get a notification |
| Where you see it | Citizen: **CivicVerse -> Achievements** shows a progress bar ("7 of 10 resolved"), open reports, and earned rewards. Admin: **Staff -> Rewards** |
| Payment | **The app does not move money.** It records the entitlement as `earned`. An admin pays or issues it outside the app, then presses **Mark as given** (optional note, for example a payment reference). The citizen is notified and the action is audited |
| Currency | INR is an assumption (the pilot is in Bengaluru). It, the amount and the threshold are settings |

Change the rule without code through the `rewards` app setting (a JSON value in `app_settings`):

```json
{ "enabled": true, "reports_required": 10, "amount": 500, "currency": "INR" }
```

API: `GET /api/v1/rewards/me` (citizen progress), `GET /api/v1/rewards?status=earned|fulfilled` and
`POST /api/v1/rewards/{id}/fulfil` (admin). Table `civic_rewards` (migration `0002`). Code: `backend/app/services/reward_service.py`.
A reward that was already granted is not taken back if a report is reopened later.

## Photo must match the report

If you attach a photo that clearly does not show the problem you described (for example the text says "pothole" and the photo
shows food, a person, a pet, an indoor room or a screenshot), CivicLens refuses it:

* In the **AI review** step the page shows "The photo does not match your description" with what the photo seems to show, and
  the **Next** button stays disabled until you change the photo or the description.
* The server refuses it too (`422`, nothing is created), including photos added later as evidence to an existing report.
* The check judges only the **type** of problem. Size, severity, quantity, colour or exact location are never a reason to refuse, and
  a dark or blurry photo of the right kind of problem is accepted.

How it works: when OpenAI analysed the photos, a separate, single-purpose vision call decides "does this show the described
type of problem?". If that check cannot be completed (no key, timeout, error) the answer is "unknown" and **nothing is blocked**.
With only the offline rules, or Ollama without `OLLAMA_VISION_MODEL`, photos cannot be checked at all.
`BLOCK_PHOTO_TEXT_MISMATCH=false` switches the refusal off. Code: `openai_service.photo_match`, `triage_service`, `api/v1/complaints.py`.

Verified against the live OpenAI model with two synthetic images: a road photo with a hole was accepted and a plate of fruit was
refused, on repeated runs. It is a language-model judgement, so occasional wrong calls are possible in both directions.

## Free-tier wake-up card

Render's free web service sleeps after a period without traffic and takes roughly 30 to 60 seconds to start again. The frontend
handles this instead of leaving you looking at a blank page:

* On every page load it asks `GET /health`. If the server answers within about 2 seconds nothing is shown.
* Otherwise a card pops up over the page ("Waking up the server") with an animated sleeping server, a timer, step indicators and
  rotating tips. When the server answers it turns into "The server is awake!" and closes by itself.
* After 150 seconds without an answer it offers **Try again** and **Continue anyway**.
* If the server falls asleep again while you use the site, a failed request triggers the same card and is repeated once when the
  server is back. A single failing request on a healthy server (one broken image, for example) never resets the page.

Code: `frontend/src/lib/wake.js` and `frontend/src/components/ServerWakeCard.jsx`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS 4, React Router 6, Zustand, Axios, Recharts, Lucide icons |
| Maps | Leaflet (report location picker), MapLibre GL 4 + Three.js 0.169 (3D City in Motion), OpenFreeMap / OpenStreetMap tiles |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, python-jose (JWT), bcrypt, httpx, Pillow, ReportLab + qrcode (certificates) |
| Databases | SQLite (local) or PostgreSQL (Render) for complaints and workflow; MongoDB Atlas for user accounts (SQL fallback) |
| AI | OpenAI (triage, vision, transcription) -> Ollama -> offline keyword rules |
| Hosting | Vercel (frontend), Render (backend + PostgreSQL) |
| Tests | pytest (backend, with mongomock; no network) |

## Architecture (short)

```
React + Vite (Vercel)  --HTTPS/REST + WebSocket-->  FastAPI (Render)  -->  SQL database
                                                         |                  SQLite (local) / PostgreSQL (Render)
                                                         |
                                                         +--> MongoDB (users/logins) when MONGODB_URI is set,
                                                         |    otherwise the SQL `users` table
                                                         +--> AI: OpenAI (primary) -> Ollama (backup) -> rules (fallback)
                                                         +--> OpenStreetMap Nominatim (optional geocoding)
```

* Complaints, workflow, evidence metadata, notifications, certificates and reference data live in SQL via SQLAlchemy.
* User accounts live in MongoDB when `MONGODB_URI` is set (for example MongoDB Atlas) and in a SQL table otherwise.
  Other tables reference users by plain string id, so the two stores are interchangeable.
* Secrets (OpenAI key, JWT secret, database URLs) exist only on the backend; the browser never receives them.

More detail and diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Roles

| Capability | Citizen | Officer | Worker | Supervisor | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Report, follow, add evidence, reopen request | yes | - | - | - | - |
| See own complaints and followed ones | yes | - | - | - | - |
| Games, points, certificates, civic reward progress | yes | - | - | - | - |
| Queue / ticket detail | - | own department | assigned tickets only | all | all |
| Classify, assign, add notes, link duplicates | - | yes | - | yes | yes |
| Change status | - | yes (not `resolved`) | own tickets: `in_progress`, `awaiting_verification` | yes (not `resolved`) | yes (not `resolved`) |
| Upload before/after evidence | - | yes | own tickets | yes | yes |
| Verify resolution (the only way to `resolved`) | - | - | - | yes | yes |
| Decide on reopen requests | - | - | - | yes | yes |
| Analytics | - | own department | - | all | all |
| CleanRoute operations (bin readings, collections) | - | yes | yes | yes | yes |
| Users, config, audit log, demo controls | - | - | - | - | yes |
| Rewards: see earned rewards and mark them given | - | - | - | - | yes |

Public self-registration always creates a citizen. Staff accounts are created by an admin.

## How to sign in (local and deployed)

Open the site, press **Log in**, type the email and password, press **Log in**. You land on the right home screen for your
role (citizens on `/app`, workers on `/staff/worker`, officers, supervisors and admins on `/staff`). On the login page, the
**Try a demo account** panel lists every demo login and fills the form for you. If the deployed backend is asleep (free
hosting), a "Waking up the server" card appears for about 30 to 60 seconds; wait for it, nothing is wrong.

### All logins at a glance

| Who | Email | Password | Lands on |
|---|---|---|---|
| **Admin (real)** | `mohammedbilalgirach@gmail.com` | `BilalRayyan123` | `/staff` |
| Admin (demo) | `admin@civiclens.demo` | `Demo@12345` | `/staff` |
| Supervisor (demo) | `supervisor@civiclens.demo` | `Demo@12345` | `/staff` |
| Officer - roads (demo) | `officer.roads@civiclens.demo` | `Demo@12345` | `/staff` |
| Officer - sanitation (demo) | `officer.waste@civiclens.demo` | `Demo@12345` | `/staff` |
| Officer - water / BWSSB (demo) | `officer.water@civiclens.demo` | `Demo@12345` | `/staff` |
| Officer - electrical (demo) | `officer.electric@civiclens.demo` | `Demo@12345` | `/staff` |
| Officer - BESCOM (demo) | `officer.bescom@civiclens.demo` | `Demo@12345` | `/staff` |
| Field worker - roads (demo) | `worker1@civiclens.demo` | `Demo@12345` | `/staff/worker` |
| Field worker - sanitation (demo) | `worker2@civiclens.demo` | `Demo@12345` | `/staff/worker` |
| Citizen (demo) | `citizen@civiclens.demo`, `citizen2@civiclens.demo` | `Demo@12345` | `/app` |
| Any citizen | **Register**, or **Continue with Google** | your own | `/app` |

Sessions: an access token lasts 60 minutes and is refreshed automatically with a 7-day refresh token; **Log out** clears both.
Login, register and password calls are rate-limited, so repeated wrong passwords are slowed down.

### Admin login (real account)

| | |
|---|---|
| Email | `mohammedbilalgirach@gmail.com` |
| Password | `BilalRayyan123` |

1. Go to the site and press **Log in**.
2. Enter the email and password above and press **Log in**. You arrive at the command centre (`/staff`). The left menu has
   **Users**, **Configuration**, **Rewards** and **Audit log**, which only an admin sees.
3. Create staff accounts under **Users -> Create staff account** (or use the demo staff accounts below).

How this account exists: the backend creates it (or promotes the existing account with that email to admin) at startup from
two environment variables. Set them on the host (Render -> Environment) and redeploy:

```
BOOTSTRAP_ADMIN_EMAIL=mohammedbilalgirach@gmail.com
BOOTSTRAP_ADMIN_PASSWORD=BilalRayyan123
```

If that email already had a Google sign-in account, it keeps working with Google and also gets the password above. An
existing password is never overwritten. **Anyone who can read this file can sign in as admin: change the password in the
host settings (and here) before sharing the repository or the site publicly.**

### Google sign-in and passwords

* **Continue with Google** works for sign-in and sign-up. A new Google user becomes a **citizen**; staff roles are only given by an admin.
* If you registered with Google you have no password yet. Open **Profile -> Password**, choose a new password (confirm with your
  current password, or with Google again if you never had one) and you can then also use the normal email + password form.
* Trying the password form with a Google-only account tells you to use Google or set a password instead of a bare "wrong password".
* Setup: set `GOOGLE_CLIENT_ID` on the backend and `VITE_GOOGLE_CLIENT_ID` (or rely on the backend `/auth/config`) on the frontend,
  and add every frontend origin (your Vercel URL, `http://localhost:5173`) as an *Authorised JavaScript origin* in Google Cloud.
  The Google client secret is never used or stored.

### Demo staff logins (work locally AND on the deployed site)

`SEED_DEMO_ACCOUNTS=true` (the default) creates the accounts below at startup, on every deployment, with **no demo
complaints**. All of them use the password **`Demo@12345`** (`DEMO_PASSWORD`). They are fictional and the password is public:
set `SEED_DEMO_ACCOUNTS=false`, or remove them from the admin console, for a site that holds real data.

## Demo accounts

Created when `SEED_DEMO_ACCOUNTS=true` (logins only) or `SEED_DEMO_DATA=true` (logins plus fictional complaints, vehicles and
bins). They are fictional. The password is `DEMO_PASSWORD` (default `Demo@12345`).

| Email | Name | Role | Department |
|---|---|---|---|
| `citizen@civiclens.demo` | Asha Rao (demo citizen) | citizen | - |
| `citizen2@civiclens.demo` | Kiran Gowda (demo citizen) | citizen | - |
| `officer.roads@civiclens.demo` | Roads Officer (demo) | officer | `road_maintenance` |
| `officer.waste@civiclens.demo` | Sanitation Officer (demo) | officer | `sanitation` |
| `officer.water@civiclens.demo` | BWSSB Officer (demo) | officer | `bwssb_water_sewerage` |
| `officer.electric@civiclens.demo` | Electrical Officer (demo) | officer | `electrical` |
| `officer.bescom@civiclens.demo` | BESCOM Officer (demo) | officer | `bescom_network` |
| `worker1@civiclens.demo` | Field Worker 024 (demo) | worker | `road_maintenance` |
| `worker2@civiclens.demo` | Field Worker 031 (demo) | worker | `sanitation` |
| `supervisor@civiclens.demo` | Supervisor (demo) | supervisor | - |
| `admin@civiclens.demo` | Administrator (demo) | admin | - |

The seeder also creates four extra fictional resident accounts (`neighbour1@civiclens.demo` ... `neighbour4@civiclens.demo`,
same password) that author some of the multi-language reports and the community-duplicate example. They are not listed on the
login page. The list above comes from `backend/app/core/demo_accounts.py`.

## Local setup

Prerequisites: Python 3.11+ (3.12 recommended), Node.js LTS with npm. PostgreSQL, MongoDB and Ollama are optional.
The commands below use port 8010 for the API because `frontend/.env.example` points there; use any free port and keep
`VITE_API_BASE_URL` in sync.

### Backend - Windows PowerShell

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env        # then edit .env (placeholders only - never commit it)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

### Backend - bash (macOS / Linux / Git Bash)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Git Bash on Windows: source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env               # then edit .env (placeholders only - never commit it)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

On start the app creates tables, seeds reference data (departments, categories, routing rules, sample SLA targets) and,
when `SEED_DEMO_DATA=true`, the demo data. API docs: `http://127.0.0.1:8010/docs`, health: `http://127.0.0.1:8010/health`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
npm run dev              # http://localhost:5173
```

`frontend/.env` must contain `VITE_API_BASE_URL=http://127.0.0.1:8010/api/v1` (and `VITE_WS_BASE_URL=ws://127.0.0.1:8010`)
matching the port you started the API on. Production build: `npm run build`.

### Tests

```bash
cd backend
python -m pytest -q                 # all backend tests; they use an isolated temporary SQLite database
python -m pytest tests/test_seed_demo.py -q
```

The test environment disables network AI (`AI_PROVIDER_ORDER=rules`), geocoding, route snapping and demo auto-seeding
(see `backend/tests/conftest.py`). Last full run: **253 passed**. Frontend: `cd frontend && npm run build` must finish without errors.

### Database migrations

Production starts with `alembic upgrade head` (see `render.yaml`). Locally the app also calls `create_all()` on start for
convenience. To create or update migrations see `backend/scripts/gen_initial_migration.sh` and
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#database-migrations).

## Environment variables

### Backend (`backend/.env`, or the Render dashboard)

Defaults are in `backend/app/config.py`. `backend/.env.example` shows the common ones.

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development`, `production`, `test` (rate limiting is off in `test`) |
| `FRONTEND_ORIGIN` | `http://localhost:5173,http://localhost:5199` | Comma-separated allowed browser origins (CORS). Set to the Vercel URL in production |
| `FRONTEND_ORIGIN_REGEX` | empty | Optional regex for extra origins, e.g. `https://.*\.vercel\.app` for preview deployments |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Frontend URL; used in certificate QR codes (`/verify/<code>`) |
| `DATABASE_URL` | `sqlite:///./civiclens.db` | SQL database. `postgres://` / `postgresql://` are rewritten to `postgresql+psycopg2://` |
| `MONGODB_URI` | empty | If set, users are stored in MongoDB; if empty, in the SQL `users` table |
| `MONGODB_DB_NAME` | `civiclens` | MongoDB database name |
| `JWT_SECRET_KEY` | insecure dev value | Token signing secret. **Must** be replaced in production |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_ACCESS_TOKEN_MINUTES` | `60` | Access token lifetime |
| `JWT_REFRESH_TOKEN_DAYS` | `7` | Refresh token lifetime |
| `AI_PROVIDER_ORDER` | `openai,ollama,rules` | Provider chain; `rules` is the offline fallback |
| `OPENAI_API_KEY` | empty | Needed for OpenAI triage and voice transcription |
| `GOOGLE_CLIENT_ID` | empty | Enables "Continue with Google" (sign in AND sign up). Public client id only - the Google client secret is **not** used. In Google Cloud Console add every frontend origin (e.g. `http://localhost:5173`, your Vercel URL) as an *Authorised JavaScript origin* on the OAuth client, or Google rejects the popup. Google sign-up always creates a **citizen**; staff accounts are issued by an admin |
| `OPENAI_TRIAGE_MODEL` | `gpt-4.1-mini` | |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local backup model server |
| `OLLAMA_MODEL` | `qwen2.5:3b` | |
| `OLLAMA_VISION_MODEL` | empty | Photos are analysed through Ollama only when this is set |
| `AI_TIMEOUT_SECONDS` | `25` | |
| `UPLOAD_DIR` | `./uploads` | Photo storage (ephemeral on Render free) |
| `CERTIFICATE_STORAGE_DIR` | `./generated_certificates` | Certificate PDFs (ephemeral on Render free) |
| `MAX_IMAGE_SIZE_MB` / `MAX_AUDIO_SIZE_MB` | `10` / `20` | Upload limits |
| `MAX_AUDIO_DURATION_SECONDS` | `90` | Voice report limit |
| `MAX_IMAGES_PER_REPORT` | `4` | |
| `SAME_USER_DUPLICATE_RADIUS_METRES` | `150` | Duplicate detection |
| `COMMUNITY_DUPLICATE_RADIUS_METRES` | `100` | Duplicate detection |
| `DUPLICATE_LOOKBACK_DAYS` | `180` | Duplicate detection |
| `GEOCODER_PROVIDER` | `nominatim` | `none` disables external geocoding |
| `GEOCODER_BASE_URL` | `https://nominatim.openstreetmap.org` | |
| `GEOCODER_USER_AGENT` | `CivicLens-prototype/1.0` | Identify your deployment (Nominatim policy) |
| `BOUNDARY_DATA_DIR` | `./data/boundaries` | Folder for official GeoJSON boundary files |
| `FALLBACK_SERVICE_AREA_RADIUS_KM` | `35` | Coarse fallback when no boundaries are imported |
| `DEFAULT_MAP_LATITUDE` / `DEFAULT_MAP_LONGITUDE` / `DEFAULT_MAP_ZOOM` | `12.9716` / `77.5946` / `12` | Map starting view |
| `GARBAGE_TRACKER_MODE` | `simulation` | CleanRoute data source (only the simulation exists) |
| `GARBAGE_SIMULATION_INTERVAL_SECONDS` | `3` | |
| `GARBAGE_SIMULATION_AUTOSTART` | `true` | Start the simulator on boot |
| `BLOCK_PHOTO_TEXT_MISMATCH` | `true` | Refuse reports whose photo does not show the described problem (needs OpenAI vision) |
| `SEED_REFERENCE_DATA` | `true` | Seed departments, categories, routing rules, SLA, games |
| `SEED_DEMO_ACCOUNTS` | `true` | Create the demo logins for every role at startup (no demo complaints). Works on deployments too |
| `SEED_DEMO_DATA` | `false` (code default; `backend/.env.example` sets `true` for local demos) | Seed fictional demo users, complaints, vehicles, bins |
| `DEMO_PASSWORD` | `Demo@12345` | Password of the seeded demo accounts |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | empty | Makes this email an admin at startup (creates it, or promotes the existing account). Password at least 10 characters; an existing password is never overwritten. Set in the Render dashboard |
| `BOOTSTRAP_ADMIN_NAME` | `Administrator` | Display name when the bootstrap admin is created |
| `ROUTE_SNAPPING` | `true` | Snap the simulated CleanRoute routes to real roads at startup (retries in the background if routing is unreachable) |
| `OSRM_BASE_URL` | `https://router.project-osrm.org,https://routing.openstreetmap.de/routed-car` | Comma-separated routing servers, tried in order. Public demo servers: light use only |
| `OSRM_TIMEOUT_SECONDS` | `20` | |

Other settings with defaults (`APP_NAME`, `API_V1_PREFIX`, `DEFAULT_CITY`, `DEFAULT_STATE`, `SERVICE_AREA_MODE`, ...) are
listed in `backend/app/config.py`.

### Frontend (`frontend/.env`, or Vercel project settings)

All `VITE_*` values are public: they are compiled into the browser bundle. **Never put a secret here.**

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `https://civiclens-api.onrender.com/api/v1` | REST base URL (includes `/api/v1`) |
| `VITE_WS_BASE_URL` | `wss://civiclens-api.onrender.com` | WebSocket base URL (no path). If empty it is derived from `VITE_API_BASE_URL` |
| `VITE_GOOGLE_CLIENT_ID` | `1234-abc.apps.googleusercontent.com` | Public Google client id (fallback when the backend is unreachable). Public by design |
| `VITE_CITY_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | Vector style for the 3D City in Motion map (must expose a `building` source-layer to get 3D buildings). Default needs no key |
| `VITE_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Raster tile source (check the tile provider's usage policy) |
| `VITE_DEFAULT_MAP_LATITUDE` / `VITE_DEFAULT_MAP_LONGITUDE` / `VITE_DEFAULT_MAP_ZOOM` | `12.9716` / `77.5946` / `12` | Map starting view |

`frontend/.env.example` also lists `VITE_DEFAULT_CITY_LABEL`; a search of `frontend/src` found no code that reads it.

## Deployment (summary)

Full guide with checklists and troubleshooting: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

**Backend on Render**

1. Push the repository to GitHub.
2. In Render choose **New > Blueprint** and select the repository. `render.yaml` creates the web service
   `civiclens-api` (root directory `backend`) and the free PostgreSQL database `civiclens-db`, wiring `DATABASE_URL`
   and generating `JWT_SECRET_KEY`.
3. When prompted, fill the `sync: false` values: `MONGODB_URI` (MongoDB Atlas free tier, optional), `OPENAI_API_KEY`
   (optional), `FRONTEND_ORIGIN`, `FRONTEND_ORIGIN_REGEX`, `PUBLIC_BASE_URL`. The Vercel URL is not known yet, so use a
   placeholder and fix it in step 6.
4. Wait for the deploy and open `https://<service>.onrender.com/health`.

**Frontend on Vercel**

5. Import the same repository, set **Root Directory** to `frontend` (Vite preset). Set `VITE_API_BASE_URL` to
   `https://<service>.onrender.com/api/v1` and `VITE_WS_BASE_URL` to `wss://<service>.onrender.com`, then deploy.
   `frontend/vercel.json` already rewrites all paths to `index.html` for the single-page app.
6. Back in Render, set `FRONTEND_ORIGIN` and `PUBLIC_BASE_URL` to the Vercel URL (no trailing slash) and redeploy the API.

Things to know:

* **Ephemeral disk.** On Render's free plan the filesystem is wiped on every deploy/restart. Uploaded photos and generated
  certificate PDFs are stored on that disk, so they will disappear (database rows stay, files do not). Use a paid
  persistent disk or object storage for anything real; this prototype does not include an object-storage adapter.
* **Cold start.** Free web services spin down when idle; the first request after a pause can take a long time, and the
  CleanRoute simulator restarts from its initial state.
* **MongoDB Atlas free tier.** Create a free cluster, a database user, allow the Render service to connect (network
  access list), and paste the connection string into `MONGODB_URI`. Leave it empty to use SQL for users.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Waking up the server" card for up to a minute | Normal on Render's free plan after idle time. Wait; it closes by itself. After 150 s use **Try again** |
| A page shows "Loading..." forever, or flips between "Loading" and the content | Fixed in commit `1a83dc9` (the translation helper changed on every render and made pages refetch endlessly). Hard-refresh with Ctrl+Shift+R so the browser drops the old script |
| Browser console says CORS blocked / "Network Error" on the live site | `FRONTEND_ORIGIN` on Render must contain the exact Vercel URL (no trailing slash). Redeploy after changing it |
| Google button disabled or "origin not allowed" | Set `GOOGLE_CLIENT_ID` on Render and add the site URL as an *Authorised JavaScript origin* in Google Cloud Console |
| "Invalid email or password" for a Google-created account | It has no password yet: use **Continue with Google**, then set one under **Profile -> Password** |
| Admin login fails on the live site | Check `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` are set on Render and the service was redeployed (watch the log for "bootstrap admin"). The password must be at least 10 characters. If the account already had a different password, that password still applies |
| Demo logins do not work on the live site | `SEED_DEMO_ACCOUNTS` must not be `false`, and the demo accounts must not have been removed with **Remove demo data** (that deactivates them) |
| "The photo does not match your description" | Attach a photo of the described problem, remove the photo, or fix the description. Turn the guard off with `BLOCK_PHOTO_TEXT_MISMATCH=false` |
| Photos or certificate PDFs disappear on the live site | Render's free disk is wiped on every deploy; the database rows stay. See the ephemeral-disk note above |
| CleanRoute routes look like straight lines | Road snapping needs the public OSRM servers; the backend retries a few times after start. The UI says when a route is not snapped |
| `Voice` fails | Needs `OPENAI_API_KEY` on the backend and a browser microphone permission |

## What changed recently

* **Photo-vs-text guard**, **civic reward** (INR 500 per 10 resolved), **Rewards admin page**, migration `0002_civic_rewards`.
* **Demo logins for every role in production** (`SEED_DEMO_ACCOUNTS`), bootstrap admin that can promote an existing account,
  README login reference.
* **Free-tier wake-up card**; the app is never unmounted after the first server check.
* **Fixes:** endless loading on report pages (unstable translation helper), blank flash when opening a page for the first time
  (page-level loader + preloading), mobile over-scroll at the bottom of the home page, My reports / Report layout.
* **Earlier:** Google sign-in/sign-up and passwords for Google accounts, voice reports continue automatically, long road-following
  CleanRoute routes, coloured 3D City in Motion, demo data off by default with an admin purge, Georgia / Playfair Display typography.

## Known limitations / not verified

Please read this before relying on anything here.

* **Official boundary polygons are not bundled.** Until you import official GBA / City Corporation GeoJSON
  (see `docs/BOUNDARIES.md`), the service-area check uses a coarse radius around the map centre and says so
  (`fallback_approximate`). Corporation, zone and ward are left empty and tickets are marked `needs_manual_routing`.
  The demo complaints are all in that state. Nothing infers a ward from a locality name.
* **No PostGIS and no pgvector.** Distances are computed with a bounding-box prefilter plus haversine in Python;
  duplicate text similarity uses token overlap / `difflib`, not embeddings. This is fine at prototype scale and has not been
  load-tested.
* **Language quality is not validated by native speakers.** UI translations in the six languages, the multilingual keyword
  rules, voice transcription accuracy, and the demo complaint texts and translations are machine-written / machine-dependent and
  need review by fluent speakers before any real use.
* **AI output is not evaluated.** No triage accuracy benchmark is included, and the automated tests are configured not to call
  the network (`AI_PROVIDER_ORDER=rules`), so live OpenAI / Ollama behaviour needs your own testing. Routing rules and SLA
  targets are starting/sample values from the spec, not official municipal commitments or legal asset ownership.
* **CleanRoute data is simulated.** Truck positions, speeds, ETAs and bin fill levels are generated by a simulator and are
  labelled `DEMO / SIMULATED GPS`. No real vehicle, driver or sensor is involved.
* **Nominatim usage policy.** The default geocoder is the public OpenStreetMap Nominatim instance, which allows light use only
  (identify the app with a User-Agent, about one request per second, cache results). Do not run a public launch on it; host your
  own or use a commercial provider, or set `GEOCODER_PROVIDER=none`. The same applies to the default OSM raster tiles.
* **MongoDB path.** The automated tests use `mongomock` only. The live site is configured with MongoDB Atlas (see `/health`), and
  sign-in works against it, but the full set of Mongo-backed flows was not exercised end to end by the authors.
* **PostgreSQL path.** Development and tests use SQLite. The deployed Render instance reports `sql_backend: postgresql` and
  `user_store: mongodb` on `/health`, so the live site does run on both, but the migrations were only ever applied to SQLite by
  the authors (`0001_initial_schema.py`, 34 tables, and `0002_civic_rewards.py`). Check the Render deploy log after each release.
  The Docker image and `infra/docker-compose.yml` were written but not executed.
* **City in Motion.** Verified in a real browser: basemap, 3D buildings, clustered complaints, routes, bins, vehicle labels,
  list view and the vehicle detail panel. The Three.js truck is a **procedural** low-poly model built in code (no third-party
  GLB is bundled; a GLB can be dropped in, see `frontend/public/models/README.md`) and its visual quality/orientation has not
  been confirmed. The basemap comes from the public OpenFreeMap service (attribution shown); check its terms before a public
  launch. Mobile layout and touch behaviour were not tested. The simulator runs faster than real time (vehicles about 10x, bin
  fill about 60x) so a demo shows movement; speeds and ETAs are therefore simulated values.
* **In-memory rate limiting** is per process (adequate for a single instance, not for several).
* **Uploads and certificates** are stored on local disk (see the ephemeral disk note above); there is no antivirus scan and
  no retention job for raw uploads.
* **Rewards are records, not payments.** The app never pays anyone. The INR currency is an assumption. There is no fraud scoring
  beyond "resolved and verified by a supervisor", so an admin should check an earned reward before handing it over.
* **Photo check is a model judgement.** It needs OpenAI vision, can be wrong in either direction, and is skipped (nothing blocked)
  when it cannot run. Only synthetic images were used to test it.
* **Public demo password.** With `SEED_DEMO_ACCOUNTS=true` the demo admin and staff accounts are open to anyone who reads this file.
  The README also lists a real admin password: change it before sharing the repository or the site widely.
* **Not verified:** mobile layouts and real-phone behaviour, the wake-up card against a real Render cold start (tested by stopping and
  starting a local backend), live Google sign-in completion on every origin, and Render's behaviour after the latest deploy.
* **Not an emergency service.** The app shows a notice to that effect; never use it to report immediate danger.

## Repository layout

```
README.md            this file
render.yaml          Render blueprint (API + PostgreSQL)
backend/             FastAPI app (app/), tests/, alembic/, scripts/, Dockerfile
frontend/            React + Vite app (src/), vercel.json
infra/               optional docker-compose (PostgreSQL + MongoDB + API)
docs/                specification, API contract, architecture, deployment, boundaries
```

## Deployed instance checklist

Frontend (Vercel): `https://acharyap2p.vercel.app` - Backend (Render): `https://acharyap2p.onrender.com`

* **Vercel** needs no dashboard variables: `frontend/.env.production` (public URLs only) is used by `vite build`. Local
  `npm run dev` keeps using `frontend/.env` (your local backend).
* **Render environment variables** (dashboard > Environment) - set these, then redeploy (or use **Manual Deploy**):

  | Variable | Value |
  |---|---|
  | `FRONTEND_ORIGIN` | `https://acharyap2p.vercel.app` (CORS; also the code default since this commit) |
  | `PUBLIC_BASE_URL` | `https://acharyap2p.vercel.app` (certificate QR codes) |
  | `GOOGLE_CLIENT_ID` | your OAuth client id (public). Until it is set, `/api/v1/auth/config` reports `google_enabled:false` |
  | `OPENAI_API_KEY` | your key (secret - Render dashboard only, never in git) |
  | `AI_PROVIDER_ORDER` | `openai,rules` (no Ollama on Render) |
  | `JWT_SECRET_KEY` | a long random string - **do not leave the development default** |
  | `APP_ENV` | `production` |
  | `DATABASE_URL` | Render PostgreSQL internal URL. Without it the app uses SQLite on Render's ephemeral disk and **loses all data on every deploy/restart** |
  | `MONGODB_URI` | MongoDB Atlas connection string (secret). Empty = users in SQL. Allow Render in the Atlas network access list |
  | `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | the real admin (see [Admin login](#admin-login-real-account)); password at least 10 characters |
  | `SEED_DEMO_ACCOUNTS` | `true` keeps the demo staff logins available on the live site (the default); `false` removes the default logins for a site with real data |
  | `SEED_DEMO_DATA` | `false` on the live site (no fictional complaints, trucks or bins) |

* **Google Cloud Console** > OAuth client > *Authorised JavaScript origins*: add `https://acharyap2p.vercel.app` (and
  `http://localhost:5173` for local development). The backend port is never an origin. The redirect URI field is unused.
* Render free instances sleep when idle, so the first request after a pause can take about a minute.

### Turning demo data off (public sites)

Demo data is **off by default** (`SEED_DEMO_DATA=false`). A site that was started with demo data on still contains the demo
accounts (password `Demo@12345`, including an admin), so after switching it off:

1. In Render set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (at least 10 characters) and `SEED_DEMO_DATA=false`,
   then redeploy. At startup the app makes that email an admin: it promotes the existing account with that email, or (only if
   no active non-demo admin exists yet) creates it. An existing password is never overwritten.
2. Sign in as that admin, open **Staff > Admin > Configuration > System > Demo data > Remove demo data**, and type
   `DELETE DEMO DATA`. This deletes the fictional complaints and simulated CleanRoute data and **deactivates** all demo
   accounts. Real data is untouched. It is refused for a demo admin, so you cannot lock yourself out.
   (API: `POST /api/v1/admin/demo-data/purge` with `{"confirm":"DELETE DEMO DATA"}`.)
3. With demo data off the site starts empty: there are no fictional vehicles, bins or complaints on the City in Motion map until
   real ones exist. The category / department / routing configuration is kept.

Demo LOGINS (no demo complaints) are separate: `SEED_DEMO_ACCOUNTS` (default `true`) keeps the demo staff accounts available on
the deployed site. Set it to `false` when the site holds real data, and run **Remove demo data** to deactivate the ones that
already exist. Locally, keep `SEED_DEMO_DATA=true` in `backend/.env` if you want the full demo data for development.

