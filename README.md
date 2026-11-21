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

## Features

Described in detail in `docs/API_CONTRACT.md` (see the docs for exact request/response shapes):

* **Citizen reporting** - text or voice (transcription needs an OpenAI key), up to a configurable number of photos,
  GPS / map pin / address search for location, a "review the AI summary" step, six languages (Kannada, English, Hindi,
  Tamil, Telugu, Malayalam).
* **AI triage** - OpenAI first, Ollama as backup, deterministic multilingual keyword rules as the last resort. The model
  only proposes category, summary and factor scores; the severity label, escalation rules and routing are deterministic
  and the officer can override them (every override is audited).
* **Duplicate detection** - same-user and community duplicates by distance and text similarity (no PostGIS; haversine).
* **Service-area check** - uses imported official boundaries when present, otherwise a coarse, clearly flagged fallback.
* **Command centre** - prioritised queue, dashboard, analytics, classification/assignment, status workflow with
  immutable history, internal vs public notes, duplicate linking, SLA (sample targets) and priority scoring.
* **Resolution workflow** - workers upload before/after evidence; only a supervisor/admin can mark a ticket
  `resolved` (via verify-resolution); reopen requests are decided by a supervisor.
* **Recognition** - certificates of appreciation (PDF with QR code and public verification page), civic points,
  achievements, and two games (Clean City Challenge, Civic Quiz Arena).
* **Civic reward** - a citizen earns INR 500 for every 10 of their OWN reports that are resolved AND verified by a
  supervisor (open, rejected or duplicate reports do not count). The app only records the entitlement; an admin marks it
  given after paying it outside the app (`/staff/admin/rewards`). Amount, threshold, currency and an on/off switch live in
  the `rewards` app setting (defaults: 10 reports, 500, INR, enabled). See `backend/app/services/reward_service.py`.
* **Photo must match the report** - with OpenAI vision available, a report (or extra evidence) whose photo clearly does
  not show the problem described is refused with a clear message, and the review step blocks it before submit. With only
  the offline rules or Ollama without a vision model, photos cannot be checked, so nothing is blocked
  (`BLOCK_PHOTO_TEXT_MISMATCH=false` turns the guard off).
* **CleanRoute** - SIMULATED garbage-truck positions and bin fill levels with a live WebSocket feed.
* **City in Motion (3D)** - route `/city-in-motion`: MapLibre GL map of Bengaluru with real extruded 3D buildings
  (OpenFreeMap vector tiles, no API key), clustered complaint markers, simulated garbage trucks (Three.js), routes and bins.
  It is a visual layer over the SAME FastAPI/SQL data (`/api/v1/city-twin/*`, WebSocket `/ws/v1/city-twin/live`) - not a
  separate app. Filters, list view (accessible alternative), role-aware detail panel, 2D/3D toggle. See
  `docs/CITY_TWIN_CONTRACT.md` and `docs/assets/ASSET_CREDITS.md`.
* **Admin console** - users, departments, categories, routing rules, SLA targets, settings, audit log.
* **Demo data** - a seeder creating fictional accounts and about 26 complaints in all categories and severities.

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
| Games, points, certificates | yes | - | - | - | - |
| Queue / ticket detail | - | own department | assigned tickets only | all | all |
| Classify, assign, add notes, link duplicates | - | yes | - | yes | yes |
| Change status | - | yes (not `resolved`) | own tickets: `in_progress`, `awaiting_verification` | yes (not `resolved`) | yes (not `resolved`) |
| Upload before/after evidence | - | yes | own tickets | yes | yes |
| Verify resolution (the only way to `resolved`) | - | - | - | yes | yes |
| Decide on reopen requests | - | - | - | yes | yes |
| Analytics | - | own department | - | all | all |
| CleanRoute operations (bin readings, collections) | - | yes | yes | yes | yes |
| Users, config, audit log, demo controls | - | - | - | - | yes |

Public self-registration always creates a citizen. Staff accounts are created by an admin.

## How to sign in (local and deployed)

Open the site, press **Log in**, type the email and password, press **Log in**. You land on the right home screen for your
role (citizens on `/app`, workers on `/staff/worker`, officers, supervisors and admins on `/staff`). On the login page, the
**Try a demo account** panel lists every demo login and fills the form for you. If the deployed backend is asleep (free
hosting), a "Waking up the server" card appears for about 30 to 60 seconds; wait for it, nothing is wrong.

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

The test environment disables network AI (`AI_PROVIDER_ORDER=rules`), geocoding and demo auto-seeding
(see `backend/tests/conftest.py`).

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
| `SEED_DEMO_DATA` | `true` | Seed fictional demo users, complaints, vehicles, bins |
| `DEMO_PASSWORD` | `Demo@12345` | Password of the seeded demo accounts |

Other settings with defaults (`APP_NAME`, `API_V1_PREFIX`, `DEFAULT_CITY`, `DEFAULT_STATE`, `SERVICE_AREA_MODE`, ...) are
listed in `backend/app/config.py`.

### Frontend (`frontend/.env`, or Vercel project settings)

All `VITE_*` values are public: they are compiled into the browser bundle. **Never put a secret here.**

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `https://civiclens-api.onrender.com/api/v1` | REST base URL (includes `/api/v1`) |
| `VITE_WS_BASE_URL` | `wss://civiclens-api.onrender.com` | WebSocket base URL (no path). If empty it is derived from `VITE_API_BASE_URL` |
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
* **MongoDB path.** The Mongo user store is tested with `mongomock` only. It was not run against a real MongoDB / Atlas
  unless you configure a real `MONGODB_URI` and test it yourself.
* **PostgreSQL path.** Development and tests use SQLite. The Render PostgreSQL deployment, the Alembic migration against
  PostgreSQL, the Docker image and `infra/docker-compose.yml` were written but not executed by the authors of these files.
  The initial migration (`backend/alembic/versions/0001_initial_schema.py`, 34 tables) was generated and applied to an empty
  SQLite file only; run it against an empty PostgreSQL database and check the result before relying on it.
* **City in Motion.** Verified in a real browser: basemap, 3D buildings, clustered complaints, routes, bins, vehicle labels,
  list view and the vehicle detail panel. The Three.js truck is a **procedural** low-poly model built in code (no third-party
  GLB is bundled; a GLB can be dropped in, see `frontend/public/models/README.md`) and its visual quality/orientation has not
  been confirmed. The basemap comes from the public OpenFreeMap service (attribution shown); check its terms before a public
  launch. Mobile layout and touch behaviour were not tested. The simulator runs faster than real time (vehicles about 10x, bin
  fill about 60x) so a demo shows movement; speeds and ETAs are therefore simulated values.
* **In-memory rate limiting** is per process (adequate for a single instance, not for several).
* **Uploads and certificates** are stored on local disk (see the ephemeral disk note above); there is no antivirus scan and
  no retention job for raw uploads.
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
* **Render environment variables** (dashboard > Environment) - set these, then redeploy:

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

