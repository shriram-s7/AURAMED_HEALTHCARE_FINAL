# AuraMed hosting: Vercel frontend + Oracle backend

Status: Vercel-only saved sample demo published at https://auramed-theta.vercel.app.
Production and preview builds explicitly set `VITE_HOSTED_DEMO=true`. This
installs a browser-side API adapter that serves only public synthetic fixtures;
it never forwards API calls to a backend. Development ignores this flag because
activation also requires `import.meta.env.PROD`; local backend/models/database
remain in use. Production builds without the flag also use the real API.

Three sample roles are available: testdr1@auramed.com / Doctor@123,
testpatient1@auramed.com / Patient@123, testadmin1@auramed.com / Admin@123.
These are public demo sessions, not credentials for a connected backend.
The demo uses separate auth and draft storage namespaces. Nine fixed sample
cases contain actual locally generated outputs from all three trained models,
clinical formulas, fusion, reasoning and heatmaps. Model results are never
invented based on the preset label. Only matching image SHA-256 hashes, views,
patient and unchanged inputs can retrieve the saved analysis. Custom uploads
and clinical overrides are unavailable. Results and PDFs preserve the original
backend's diagnostic-to-risk normalization.

Signing and portal sharing are simulated in memory and reset on refresh.
Patient reports show the public sample library. PDFs are precomputed and
watermarked on every page; they do not change when demo signing is simulated.
New accounts, records, appointments, referrals, email/SMS and real model
inference require a backend. All other unsupported writes return an explicit
error. Every page has a persistent demo notice. No local patient records or
model files are included in this deployment.

Fixture exports use deploy/.demo-build/fixture.db and isolated uploads, with
notifications disabled. Scripts: build_public_demo.py, finalize_public_demo.py,
correct_demo_pcos_reports.py, watermark_demo_reports.py. The export uses the actual module fusion weights (60/40 breast, 55/45 cervical,
50/50 PCOS) in the UI and PDFs. PCOS uses its pipeline-specific actions; breast
image risk scores are distinguished from overall confidence. No model scores
or local templates change. Image panels use the actual static sample URL and
saved blended Grad-CAM so overlays are not multiplied onto an empty background.
Both image disclosures are expanded by default in the hosted demo. Demo login
controls are visible only on the login page.
The final public assets live in
frontend/public/hosted-demo. To check the adapter:
`node --test tests/hostedDemo.test.js tests/workflow.test.js` in frontend.

The static demo has no backend sleep or GPU quota. Vercel Hobby is restricted
to personal/non-commercial use and current transfer/request quotas; exceeding
limits can pause access. No free provider guarantees unchanged terms forever.

Update: the user has no payment card, so Oracle deployment is on hold. Oracle
requires an accepted credit/debit card during signup verification. The Oracle
configuration below remains available but is not the selected deployment path.
Vercel account access and CLI publishing sign-in are connected.
An alternative under investigation is Hugging Face ZeroGPU: free accounts with
a verified email and age over 30 days can host up to two Gradio Spaces. This
requires adapting the model service and separately addressing persistent app
records; it is not a replacement VM for the current backend. GPU usage is queued
and subject to daily quotas. The user created a Hugging Face account on
4 October 2026, so eligibility begins around 4 November, subject to email
verification and provider rules. No alternative backend has been deployed yet.

Local checks passed: production frontend build; all three local weight files
loaded with successful inference checks; all three loaders rejected missing and
corrupt checkpoints in cloud mode; hosting settings generation and secret
overwrite protection. The frontend build reports a large JavaScript bundle,
which may slow the initial page load on mobile connections.

## Account setup

- Vercel: connect the account, use Hobby for this personal/non-commercial demo.
- Oracle: create an Always Free eligible Ubuntu ARM A1 VM in the home region,
  with 2 OCPUs and 12 GB RAM in total. Confirm the console marks all selected
  resources Always Free, rather than relying on trial credits. Free capacity
  may be unavailable. Stay within the account's total storage allowance.
- Give the backend a DNS hostname pointing to the VM's public IP. A custom
  domain can have its own annual renewal charge; choose the hostname before
  configuring this deployment.
- Permit inbound TCP 80 and 443 in Oracle networking and the VM firewall.
  Limit SSH access to your own IP. Install Docker Engine and the Compose plugin.
  The backend's port 8000 is internal to Docker, not published.

## Configure on this Windows computer

From the project root, once both final URLs are known:

```powershell
./deploy/Configure-Hosting.ps1 -BackendUrl https://api.your-domain.example -FrontendUrl https://your-project.vercel.app
```

This generates a new cloud signing secret without printing it, writes
`deploy/.env.cloud`, and configures Vercel's API/upload proxy and React routing.
It refuses to overwrite an existing cloud environment file. Later URL changes
require updating the origins and proxy destinations while preserving the secret.
The checked-in Vercel config only supports frontend routing until this step.

## Publish backend

Transfer `backend/app`, `backend/requirements.txt`, `backend/Dockerfile.cloud`,
`backend/.dockerignore`, and the `deploy` folder securely to the VM. Include all
three `.pth` weights and metadata in `backend/app/ml/weights`. Git ignores the
weights, so a Git-based checkout alone will not include them. Do not copy local
databases, uploads, personal records, development environments, or local `.env`
files. Transfer only the newly generated `deploy/.env.cloud` for cloud settings.

On the VM, from the project root:

```sh
docker compose --env-file deploy/.env.cloud -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env.cloud -f deploy/compose.yml ps
```

Caddy obtains and renews HTTPS certificates. The backend uses one worker so
each model is loaded once. SQLite records, uploads and HTTPS certificates live
in named Docker volumes and survive ordinary rebuilds/restarts. Do not run
`docker compose down -v`: it removes those volumes. Off-server backups are
still necessary to survive VM loss. Back up database and uploads together while
the backend is stopped, or use SQLite's backup API for a consistent live copy.

The cloud requires trained model files. Missing/incompatible files cause startup
to fail instead of exposing predictions made with random development weights.
An existing file loading successfully does not establish clinical validity.

The new database starts empty. Configure fresh demo accounts and synthetic data
before sharing. The existing `backend/seed_db.py` wipes its target database;
do not run it on a database containing records that need to be kept.

## Publish frontend

Deploy only `frontend` to Vercel, using Vite, `npm run build`, output `dist`.
Use the generated `vercel.json`. Set `VITE_API_BASE_URL=/api` in Vercel as well;
`frontend/.env.production` already supplies that for production builds.
API and upload rewrites must precede the React page fallback. Using one public
origin preserves relative image URLs throughout the existing interface.
Long analysis requests and large uploads need testing against proxy limits;
if they exceed them, move API requests to the backend origin, resolve media URLs
there too, and use asynchronous analysis jobs instead of long browser requests.

## Required live checks

1. Backend and frontend `/api/health` both return `{"status":"ok"}`.
2. Logs confirm all three weights load and startup inference checks succeed.
3. Register/login with fresh demo accounts and approved doctor access.
4. Complete one sample scan per module, view images/heatmaps, generate a PDF.
5. Refresh a nested doctor/patient page directly; it must still open.
6. Restart the backend and confirm the demo records and uploaded scans remain.

Local verification cannot replace these checks. Docker build, ARM compatibility,
HTTPS and live model latency remain unverified until a VM is available.

## When free hosting ends or becomes a problem

Checked 4 October 2026. Provider terms can change.

| Trigger | Consequence |
| --- | --- |
| Oracle trial ends after 30 days | Always Free eligible resources continue; resources funded only by trial credits do not. |
| Oracle sees low use over a 7-day period | An Always Free VM may be reclaimed. Oracle defines idle as CPU 95th percentile below 20%, network below 20%, and A1 memory below 20%. A small demo can meet those conditions. |
| Oracle has no free capacity in the home region | Creating/replacing the VM can be blocked. |
| Vercel Hobby allowance is exceeded | Features can pause; in most cases you must wait 30 days before using them again. Current included frontend allowances include 100 GB data transfer and 1 million CDN requests. |
| Commercial use | Vercel Hobby permits only personal/non-commercial use; a commercial rollout needs an appropriate plan/provider. |
| Several users run scans simultaneously | CPU analysis can slow down or time out. The sustainable number needs measurement on the actual VM. |
| Disk fills with scans, reports or logs | Uploads or database writes can fail. Watch disk utilization and back up data. |
| SMS/WhatsApp or paid email delivery is enabled | Separate providers can charge; these are not included in free web hosting. |
| Upgrading plans or selecting resources outside free allowances | Charges can start under those providers' billing rules. No paid upgrade is included in this setup. |

There is no guaranteed expiry date for a deployment using only free allowances.
There is also no guarantee of indefinite availability. Check provider usage,
Oracle idle notices, failed health checks, slow analyses and storage usage.
Automatic monitoring has not been configured.

Sources:
- https://vercel.com/docs/plans/hobby
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
