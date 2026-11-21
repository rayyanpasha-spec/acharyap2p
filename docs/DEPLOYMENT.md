# Deployment guide: Render (API + PostgreSQL), Vercel (frontend), MongoDB Atlas (optional users)

Target shape (from `docs/API_CONTRACT.md` section 10):

| Piece | Where | Config |
|---|---|---|
| FastAPI backend | Render web service `civiclens-api`, root directory `backend` | `render.yaml` |
| SQL database | Render PostgreSQL `civiclens-db` (free plan) | wired to `DATABASE_URL` by `render.yaml` |
| User accounts (optional) | MongoDB Atlas free cluster | `MONGODB_URI` |
| React frontend | Vercel, root directory `frontend` | `frontend/vercel.json`, `VITE_*` variables |

**Status of this guide.** `render.yaml` was checked to be valid YAML and `alembic` was checked to load `alembic/env.py`
against an empty SQLite file. The Render, Vercel and Atlas steps themselves were **not executed** by the author of this
document; dashboard wording may differ slightly from what you see.

## 0. Before you start

* A GitHub (or GitLab/Bitbucket) repository containing this project, with `render.yaml` at the repository root.
* Accounts on Render and Vercel. MongoDB Atlas and an OpenAI key are optional.
* Decide whether this is a **demo** (keep `SEED_DEMO_DATA=true`, anyone can log in with the published demo password)
  or something else (set `SEED_DEMO_DATA=false` and change `DEMO_PASSWORD`).
* Generate the initial database migration once (`backend/scripts/gen_initial_migration.sh`, see
  [Database migrations](#database-migrations)) and commit it before the first production deploy.

## 1. MongoDB Atlas (optional)

Skip this if SQL storage for users is fine: leave `MONGODB_URI` empty and users live in the PostgreSQL `users` table.

1. Create a free (M0) cluster in Atlas.
2. Create a database user with a strong password (Database Access). Use a user that can read/write only the CivicLens
   database if you can.
3. Network Access: the API must be allowed to connect. Render's free tier does not give a fixed outbound IP address, so
   people commonly allow `0.0.0.0/0` for a prototype. That exposes the cluster to the whole internet (protected only by the
   user password), so do not do it for real data; use a paid plan with static egress and an allow-list instead.
4. Copy the driver connection string (`mongodb+srv://<user>:<password>@<cluster>/...`). Put it into Render as
   `MONGODB_URI`. URL-encode special characters in the password.
5. `MONGODB_DB_NAME` defaults to `civiclens`.

The Mongo code path is covered by tests that use `mongomock`. It has not been run against a real Atlas cluster by the
authors; after deploying, check `GET /health` and confirm `user_store` is `mongodb`.

## 2. Render: API + PostgreSQL

### Using the Blueprint (recommended)

1. Push the repository to GitHub.
2. In the Render dashboard choose **New > Blueprint**, connect the repository and pick the branch. Render reads
   `render.yaml` and proposes:
   * a free PostgreSQL database `civiclens-db`;
   * a free Python web service `civiclens-api` with root directory `backend`, build command
     `pip install -r requirements.txt`, start command
     `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/health`.
3. Render prompts for the variables marked `sync: false` in `render.yaml`:

   | Variable | What to enter |
   |---|---|
   | `MONGODB_URI` | Atlas connection string, or leave empty to use SQL for users |
   | `OPENAI_API_KEY` | Your key, or leave empty (triage then uses the rules fallback; voice transcription returns 503) |
   | `FRONTEND_ORIGIN` | The Vercel URL, e.g. `https://civiclens.vercel.app` (no trailing slash). Use a temporary value now if you have not deployed the frontend yet |
   | `FRONTEND_ORIGIN_REGEX` | Optional, e.g. `https://civiclens-.*\.vercel\.app` to allow Vercel preview URLs. Leave empty otherwise |
   | `PUBLIC_BASE_URL` | The same Vercel URL (used in certificate QR codes) |

4. Apply the Blueprint. Render builds and deploys. Open `https://<your-service>.onrender.com/health`; expect
   `{"status":"ok", ... "sql_backend":"postgresql", "user_store":"mongodb" or "sql"}`.
5. Open `https://<your-service>.onrender.com/docs` to see the API documentation.

Values set by `render.yaml` itself: `PYTHON_VERSION=3.12.5`, `APP_ENV=production`, `DATABASE_URL` (from the database's
connection string), `JWT_SECRET_KEY` (generated), `MONGODB_DB_NAME=civiclens`, `AI_PROVIDER_ORDER=openai,rules`
(Ollama is not available on Render), `SEED_DEMO_DATA=true`, `GARBAGE_SIMULATION_AUTOSTART=true`.
If Render does not accept that exact Python patch version, change `PYTHON_VERSION` to a 3.12.x version it lists.

`DATABASE_URL`: Render provides `postgres://` or `postgresql://` URLs; `app/config.py` rewrites them to
`postgresql+psycopg2://`, so no manual change is needed (`psycopg2-binary` is in `requirements.txt`).

### Manual alternative

Create a PostgreSQL database and a Web Service by hand with the same settings as above (root directory `backend`,
runtime Python, same build/start commands, health check path `/health`) and add the environment variables from the table
in the root `README.md`.

### Things to know about Render free

* **Ephemeral disk.** Files written to `UPLOAD_DIR` and `CERTIFICATE_STORAGE_DIR` (photos, certificate PDFs, evidence
  images) are lost on every deploy and restart. Database rows remain, so after a restart a ticket may point at an image
  that no longer exists, and certificate PDFs must be regenerated (the demo seeder re-attempts the demo certificate on
  start, but only the PDF of that single demo certificate). A persistent disk (paid) or object storage is required for
  real use; the application has no object-storage adapter.
* **Cold start.** Free services spin down after a period without traffic; the next request waits for a restart that can
  take a while. The WebSocket feeds disconnect, and the CleanRoute simulator restarts from its seeded state.
* **Free PostgreSQL limits.** Free databases have small storage and, according to Render's published terms at the time of
  writing, may expire after a limited period. Check Render's current free-tier terms and take backups before relying
  on it.
* **Seeding on every start.** The seeders are idempotent: reference data and demo data are created only when missing.

## 3. Vercel: frontend

1. In Vercel choose **Add New > Project**, import the same repository.
2. Set **Root Directory** to `frontend`. The framework preset is Vite; build command `npm run build`, output directory
   `dist` (the defaults).
3. Add environment variables (Production, and Preview if you use it):

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<your-service>.onrender.com/api/v1` |
   | `VITE_WS_BASE_URL` | `wss://<your-service>.onrender.com` |

   Optional: `VITE_MAP_TILE_URL`, `VITE_DEFAULT_MAP_LATITUDE`, `VITE_DEFAULT_MAP_LONGITUDE`, `VITE_DEFAULT_MAP_ZOOM`.
   These are public values compiled into the bundle; never add secrets.
4. Deploy. `frontend/vercel.json` rewrites every path to `/index.html`, so deep links such as `/app/complaints/CL-...`
   and `/verify/<code>` work on refresh.
5. Copy the production URL (for example `https://civiclens.vercel.app`).

`VITE_*` values are baked in at build time: after changing one, **redeploy** the frontend.

## 4. Connect the two (CORS)

1. In Render, open `civiclens-api` > Environment and set:
   * `FRONTEND_ORIGIN` = the Vercel URL, exactly (scheme + host, no trailing slash, no path).
     Multiple origins are comma-separated.
   * `PUBLIC_BASE_URL` = the same URL.
   * Optional `FRONTEND_ORIGIN_REGEX` for preview deployments.
2. Save; Render redeploys the API.
3. Open the Vercel site, then the browser developer tools. API calls should succeed with no CORS error.

## 5. Database migrations

* The start command runs `alembic upgrade head` on every deploy, using `settings.DATABASE_URL` (`backend/alembic/env.py`).
* The app also runs `create_all()` at startup as a local-development convenience, which creates missing tables but never
  alters existing ones. Real schema changes must go through Alembic.
* **Creating the initial migration (maintainer task, not yet run):**

  ```bash
  bash backend/scripts/gen_initial_migration.sh
  ```

  It autogenerates `backend/alembic/versions/0001_initial_schema.py` against an empty temporary SQLite file. Review the
  file, test `cd backend && alembic upgrade head` on an empty database (ideally an empty PostgreSQL database), commit it.
* Later model changes: `cd backend && alembic revision --autogenerate -m "describe change"`, review, commit.
* With no migration file present, `alembic upgrade head` is a no-op and the tables come from `create_all()`.
* If a database was created by `create_all()` and you later add the initial migration, run `alembic stamp head`
  once against that database instead of `upgrade head`, otherwise Alembic tries to create tables that exist.
* SQLite migrations use `render_as_batch` (set in `env.py`) because SQLite cannot alter most things in place.

## 6. Importing official boundaries into the hosted database

The Render free web service has no shell. Run the import from your computer against the database's **External** connection
string (shown in the Render database page), see `docs/BOUNDARIES.md`:

```bash
cd backend
DATABASE_URL="<external connection string>" python scripts/import_boundaries.py --dir ./data/boundaries --dataset-version <label> --source "<url>"
```

PowerShell: `$env:DATABASE_URL = "<external connection string>"` first. Render databases may restrict external access by IP;
add your address in the database's access settings if the connection is refused.

## 7. Post-deploy checklist

- [ ] `GET https://<api>/health` returns `status: ok` and the expected `sql_backend` / `user_store`.
- [ ] `GET https://<api>/api/v1/meta/taxonomy` returns categories.
- [ ] `JWT_SECRET_KEY` is set (generated), not the development default.
- [ ] `FRONTEND_ORIGIN` equals the Vercel URL; no CORS errors in the browser.
- [ ] `PUBLIC_BASE_URL` equals the Vercel URL (check a certificate QR/verify link).
- [ ] The login page lists demo accounts (only when `SEED_DEMO_DATA=true`); log in as `citizen@civiclens.demo` with the
      demo password; the dashboard shows seeded complaints.
- [ ] If this is not a pure demo: `SEED_DEMO_DATA=false`, `DEMO_PASSWORD` changed (or demo accounts removed by an admin).
- [ ] `OPENAI_API_KEY` set if you want AI triage and voice transcription; test one report.
- [ ] Boundaries imported, or the "approximate service area" notice is understood.
- [ ] You accept that uploads/certificates are ephemeral on this plan.
- [ ] A persistent database backup plan exists if the data matters.
- [ ] Nominatim: either keep volumes tiny, set your own `GEOCODER_USER_AGENT`, or set `GEOCODER_PROVIDER=none`.

## 8. Environment variable checklist

| Where | Variable | Required? |
|---|---|---|
| Render | `DATABASE_URL` | yes (Blueprint wires it) |
| Render | `JWT_SECRET_KEY` | yes (Blueprint generates it) |
| Render | `FRONTEND_ORIGIN` | yes |
| Render | `PUBLIC_BASE_URL` | yes for correct certificate QR links |
| Render | `MONGODB_URI` | optional (empty = SQL users) |
| Render | `OPENAI_API_KEY` | optional (needed for OpenAI triage and voice) |
| Render | `SEED_DEMO_DATA`, `DEMO_PASSWORD` | demo only |
| Render | `GARBAGE_SIMULATION_AUTOSTART` | demo only |
| Render | `GEOCODER_PROVIDER`, `GEOCODER_USER_AGENT` | optional |
| Vercel | `VITE_API_BASE_URL` | yes |
| Vercel | `VITE_WS_BASE_URL` | recommended (derived from the API URL if empty) |
| Vercel | `VITE_MAP_TILE_URL`, `VITE_DEFAULT_MAP_*` | optional |

## 9. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser console: CORS error / requests blocked | `FRONTEND_ORIGIN` does not exactly match the Vercel URL (check `https`, trailing slash, preview URL vs production URL). Use `FRONTEND_ORIGIN_REGEX` for previews. |
| Frontend calls `127.0.0.1:8010` in production | `VITE_API_BASE_URL` was not set in Vercel, or the project was not redeployed after setting it. |
| Login works locally, fails in production with 401/network error | Wrong `VITE_API_BASE_URL` (must end with `/api/v1`), or the API is cold-starting; wait and retry. |
| First request takes a long time | Render free cold start. |
| Live CleanRoute map does not update | `VITE_WS_BASE_URL` must be `wss://...` (not `https://`, not including `/ws/...`); or the service just restarted; or `GARBAGE_SIMULATION_AUTOSTART` is not `true`. |
| Deploy fails during build with a Python version error | Change `PYTHON_VERSION` in `render.yaml` to a 3.12.x version Render supports. |
| Deploy fails at `alembic upgrade head` | Read the log. Typical cause: a migration was generated from a different model state, or the database was created by `create_all()` (use `alembic stamp head`). |
| `sqlalchemy ... could not translate host name` / cannot connect to DB | `DATABASE_URL` not wired. Check it is the Internal connection string of `civiclens-db`, same region as the service. |
| `/health` shows `user_store: sql` but you set `MONGODB_URI` | The variable is empty or has trailing spaces. |
| Mongo errors / server selection timeout | Atlas network access does not allow the Render service, wrong password/URL-encoding, or the cluster is paused. |
| Voice report returns 503 | `OPENAI_API_KEY` is not set: this is expected; the citizen is told to type instead. |
| Photos or certificates 404 after a restart | Ephemeral disk on Render free (see above). |
| Certificate QR code opens `localhost` | `PUBLIC_BASE_URL` still has the default; set it to the Vercel URL. Already issued certificates keep the URL they were created with. |
| Reverse geocoding / address search returns nothing | Nominatim unreachable, rate-limited, or `GEOCODER_PROVIDER=none`. Reporting still works (the address is optional). |
| Everyone can log in with `Demo@12345` | `SEED_DEMO_DATA=true`. Turn it off and change/remove demo accounts for anything that is not a demo. |
| Rate-limit (429) responses while testing | In-memory limiter: wait for the window to pass or restart the service. |
