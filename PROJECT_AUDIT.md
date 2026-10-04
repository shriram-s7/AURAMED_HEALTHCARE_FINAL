# AuraMed project audit

> Historical audit before the workflow improvements. Several findings below have since been addressed. See `WORKFLOW_GUIDE.md` for the implemented workflows, verification, and remaining boundaries; the original observations are retained for traceability.

Reviewed 4 October 2026. Scope: public pages, doctor/patient/admin portals, routes, service calls, authentication, scan submission, model wiring, reports, appointments, settings, notifications, startup and deployment.

## Main diagnosis

The project mixes working application code with demo behavior inside ordinary user workflows. Several controls update local state or return success without performing the promised operation. Repeated page-specific UI code, multiple sources of settings, and an inconsistent report lifecycle amplify this problem. A visual redesign alone would leave the most important defects intact.

This is a source audit with targeted execution checks, not a completed browser walkthrough of every screen. Source-confirmed findings below are distinct from visual/runtime checks still required. Application source was not changed. Running the build regenerated frontend/dist.

## Verification performed

- Frontend production build: PASS. Main JavaScript bundle is approximately 1.55 MB, 360 KB compressed; the build warns about its size.
- Frontend lint command: FAIL. ESLint 9 cannot find eslint.config.js/mjs/cjs.
- Existing image-quality tests: 6 PASS. Pytest emitted a cache-directory permission warning.
- Password checker: directly reproduced acceptance of `123` against an unrelated, invalid stored hash.
- React Router matching: cervical and PCOS explicit result routes expose only `id`; the result page consequently chooses its `breast` default.
- Report lifecycle: an isolated handler check with mocked storage reproduced signed -> shared_with_patient, loss of the lock condition, and acceptance of deletion. No real report was edited or deleted.
- All three model weight files exist in this checkout. Their presence does not establish prediction quality; full inference and dataset evaluation were not rerun.

## Critical integrity and access issues

### 1. Password verification contains an unconditional bypass

`backend/app/core/security.py:17-21` accepts several demo strings for any stored password hash. This affects login and other callers such as current-password confirmation and administrator danger-action confirmation. An existing active/approved account can accept a password unrelated to its actual password.

**Repair:** remove the bypass; demo accounts should have ordinary hashes and use the same verification path as every other account.

### 2. Shared/approved reports escape their edit and delete locks

`backend/app/api/routes/reports.py:151,220,298,376,450-463,526,616` checks only signed/addendum for locks, but sharing replaces signed with shared_with_patient and approval replaces it with approved. The same document can therefore be excluded from signed statistics and accepted by edit/delete handlers after sharing. `ScanShare.jsx:178` also treats only signed/addendum as signed, so reloading a shared report can disable its sharing workflow.

**Repair:** preserve signing independently from delivery state; enforce immutability using signing facts or a complete finalized-state rule. A signature must survive sharing.

### 3. Report sharing can silently finalize a draft

`reports.py:450-456` marks a draft approved and sets signing information inside the share handler. The API can skip the explicit review/sign step even though the UI presents signing as mandatory.

**Repair:** require a reviewed, finalized report before sharing and reject unsigned drafts.

### 4. Uploaded scans and PDFs are publicly served

`backend/app/main.py` mounts the whole upload directory as unauthenticated static files. A person with a file URL can request it without the ownership checks used by API routes. The primary-image alias in that file also has no authentication dependency.

**Repair:** serve patient files through authenticated ownership-checked endpoints or deliberately limited access links. Protect the alias too.

### 5. Two-factor authentication is a dummy setup

`frontend/src/pages/doctor/DoctorSettings.jsx:1708-1751` draws a decorative QR-like grid, displays a fixed manual code, and activates local state without reading or verifying the entered code. The backend only stores a boolean (`doctor_settings.py:352-355`); login has no second-factor challenge.

**Repair:** implement enrollment, secret storage, code verification, recovery, and login enforcement before presenting 2FA as enabled.

### 6. Session revocation is bypassed by token refresh

`backend/app/api/routes/auth.py:615-637` validates the refresh token and active user but does not check the revoked DoctorSession. It issues a fresh access token with a new identifier. `deps.py` allows a valid token when no matching session row exists, while revocation targets existing rows.

**Repair:** associate access and refresh tokens with one revocable session; enforce that session on refresh and ordinary requests. This also matters after password changes.

## Scan and report workflow defects

### 7. Cervical and PCOS results/report pages fall back to breast

`frontend/src/App.jsx` defines literal cervical/PCOS result and report routes before generic module routes. `ScanResults.jsx:48` and `ScanReport.jsx:24` rely on `params.module || 'breast'`. Literal routes provide no module parameter. Result headings, PCOS-specific tabs, next-page links and PDF names can use the wrong module even though the backend fetches the correct scan ID.

**Repair:** use one module route or pass the module explicitly and validate it against returned scan data.

### 8. Multiple uploaded views are discarded after quality checking

`backend/app/api/routes/scans.py:748-775,840-902` reads all images for quality checking, saves only the primary file, and runs inference on that one path. Additional views are not retained as a scan image collection or analyzed. The frontend's multi-view workbench suggests a fuller workflow than the backend implements.

**Repair:** persist each view and its label, define how all views affect analysis, and expose them in reports. Until then describe the primary-image limitation accurately.

### 9. Changing patients retains the previous patient's clinical inputs/images

`frontend/src/pages/doctor/ScanModule.jsx:108-138` reloads/reset drafts only when module changes. Selecting a different patient updates the query parameter and patient identity while values/images remain. The autosave effect then writes those values under the new patient's draft key.

**Repair:** reset/load all patient-specific state when patientId changes and prevent a stale request from replacing the selected patient.

### 10. Save Draft creates disconnected records

`ScanModule.jsx` ignores the returned draft scan ID; `scanService.js` omits scan_id from analysis; `scans.py:1267-1301` inserts a new scan for each save. Saved drafts contain no image, and the workbench has no complete server-draft resume flow. Repeated saves create records while analysis creates another scan.

**Repair:** keep a draft ID, update it, persist its files, and analyze/resume that same record.

### 11. Follow-up interval parsing selects incorrect dates

`ScheduleFollowupModal.jsx:5-17` checks any string containing `month` before checking `3 months` or `2-3 months`. Those recommendations become 30 days; the more specific branch is unreachable for them. All week strings similarly become seven days.

**Repair:** use a numeric interval from the API, with one shared scheduling calculation.

### 12. Follow-up scheduling differs across screens

`ScanShare.jsx:97-115,141-149` independently chooses intervals (high/critical = 14 days), whereas `scans.py` recommends critical = 7, high = 30, moderate = 75. ScanShare also silently submits 10:30 and a fixed clinic location, without corresponding user choices.

**Repair:** consume the stored recommendation and let the clinician select or confirm time/location.

### 13. Share-page selections do not affect submission

`ScanShare.jsx:47-66,122-128` offers section selections, patient/physician recipients and a message, but submits `shareReportWithPatient(report.id)` with no options. Unchecking the patient recipient still sends the default patient share. Section choices and the message are ignored.

**Repair:** send and enforce the selected options, or remove unsupported controls.

### 14. Backend physician sharing is recorded without delivery

`reports.py:475-485` records physician selection and delivery method in audit details without implementing physician delivery. Email/SMS requests add a `notification_queued` claim without channel-specific dispatch in this handler. General patient notification creation does not implement the displayed physician workflow.

**Repair:** implement a real recipient/channel delivery path with accurate outcomes, or expose portal sharing only.

### 15. Report image panels manufacture missing views

`ReportVisualPlaceholders.jsx:27-28,90-104,188-230` falls back to the primary image for a secondary projection and to a heatmap/primary image for segmentation, then decorates it with ROI/MASK labels. `ReportDetail.jsx:408` forces four-panel mode. A missing second acquisition or segmentation result can appear to exist.

**Repair:** render only artifacts actually produced; show unavailable states. A saliency map must not be labeled a segmentation mask.

### 16. Image and signature claims exceed implementation

The report page displays `DICOM Verified` and `PRIMARY DICOM`, while upload formats and image handling use ordinary raster files. The landing page promises SHA-256 signatures; the sign handler stores status/time/doctor and generates a PDF, without a stored cryptographic document signature or verification workflow. Login/settings also assert encryption/compliance that this local plain-file/HTTP implementation does not demonstrate.

**Repair:** make claims reflect implemented capabilities. External infrastructure or compliance evidence would need separate verification; this audit makes no legal compliance determination.

### 17. Formula-only fallback is stored as an image score

`scans.py:916-940` copies the clinical formula score into image_model_score when inference fails, then feeds both into fusion/confidence. A limitation message is included, but stored scores still make two inputs appear available even though only one was computed.

**Repair:** preserve an unavailable image result, record analysis mode, and use an explicit clinical-only scoring/confidence path.

### 18. Advertised calibrated thresholds are not used consistently

The loader reads a PCOS metadata optimal threshold of 0.04; `pcos_model.py:177` uses 0.55 for the image criterion, while class selection uses argmax. The loaded threshold is exposed in model information rather than passed into inference. These are different decision rules with no clear explanation to the user.

**Repair:** define which threshold serves classification/morphology/fusion, implement it consistently, and report the rule actually used. This finding does not establish which cutoff is clinically appropriate.

### 19. A second, still-registered scan API is broken and generates dummy results

`doctor_scans_submission.py` is included in `main.py` alongside the main scan API. Its image path accesses `inputs` at line 88 before assigning it at line 92, causing failure after a successful quality check. Its other path uses fixed image_score = 0.75 and fixed findings/default clinical facts. `_find_patient` accepts patients without ownership filtering and can fall back to the first patient in the entire database.

**Repair:** remove or consolidate this legacy API. Do not keep an alternate clinical endpoint with different validation, attribution and scoring behavior. The unused `_generate_mock_analysis_result` in scans.py is separate dead/demo code, not evidence that the primary analysis handler calls it.

## Dummy data, settings and administrative actions

### 20. Patient profile displays invented contact/medical information

`patient_portal.py:889-908` hardcodes address and emergency contact, substitutes an arbitrary date of birth/blood group/phone when absent, always returns notification preferences true and deletion_pending false. PATCH saves address but GET still returns a fixed address. Emergency contact and notification choices are ignored while reporting success.

**Repair:** read/save actual profile fields and return missing values honestly. Derive deletion status from requests. The alternative `/patients/me` profile API should not remain a competing contract.

### 21. Doctor privacy preferences do not persist

`DoctorSettings.jsx:246-251` sends privacy_data and shows success. The unified backend handler never processes that key, while its GET returns fixed privacy defaults (`doctor_settings.py:174`). Choices revert after reload.

**Repair:** persist/enforce these preferences and report the saved response.

### 22. Admin email/SMS tests return fabricated success

`admin.py:1943-1959` returns messages claiming SMTP/Twilio transmission without calling either provider. These tests cannot diagnose configuration or delivery.

**Repair:** attempt a real send using the active configuration, and distinguish accepted, delivered, failed and unconfigured states.

### 23. Other notification paths mark simulations as sent

`email_service.py:80-94` prints email and returns true when SMTP is unconfigured. `notifications.py:572-576` marks SMS sent without sending. Notification records therefore do not reliably prove external delivery. The recalls module has separate real-provider code and more honest channel statuses; not every messaging feature is dummy.

**Repair:** share one truthful delivery contract across all workflows; never map simulation to sent.

### 24. Database backup is a statistics export

`admin.py:1883-1921` exports table counts and latest-record dates, not row contents or uploaded files. It cannot restore the database. The download-backup endpoint exports a settings cache, not even that statistics file.

**Repair:** implement an actual backup/restore procedure and expose its scope. Rename current exports accurately.

### 25. Backup result fields do not match the UI

`AdminSettings.jsx:279-289` reads timestamp and filename; the backend returns created_at and backup_file. A successful request can show `Backup created: undefined` and erase the displayed backup time.

**Repair:** align the response contract and display the actual created result.

### 26. Clear Cache/Clear Drafts/Reset Flags are misleading

`admin.py:1976-2016`: clear-cache returns success without clearing a cache; clear_drafts returns success without deleting drafts; reset_flags changes an in-memory cache rather than the feature_flags database row used by its API.

**Repair:** implement each action against its actual source of truth, or remove it until available.

### 27. Admin controls save settings that runtime code does not consume

SystemSettings persists UI sections, but authentication, SMTP, fusion defaults and registration do not read those settings. Examples include session timeout, IP whitelist, patient-self-registration flag and email configuration. Feature flags also exist both inside general settings and in a separate feature_flags row.

**Repair:** define one settings service with explicit supported consumers. Separate informational settings from effective runtime controls.

### 28. System health is partly fabricated

`admin.py:225-245` fixes AI/email/backup health to healthy and returns constant latency/uptime figures. Real DB/storage probes coexist with these values, so “All Systems Operational” can hide missing models or unconfigured messaging. Model-info data is available separately but does not drive the AI health flag.

**Repair:** derive health from checks, label unavailable telemetry, and expose degraded mode accurately.

### 29. Patient/admin notifications are hardcoded

`PatientTopbar.jsx:28-51` and `AdminTopbar.jsx:26-57` display fixed events instead of API results. The patient report link points to rep-demo-01. Admin defaults to five new notices while its list contains four; Dismiss merely closes the panel. The admin model-validation accuracy notification is also a literal string.

**Repair:** load account-specific notifications, link real resources, and implement read/dismiss state.

### 30. Doctor Activity invents recent events and misattributes real ones

`doctor_activity.py:60-357` unconditionally adds 15 sample events with times recalculated relative to now, fake resource IDs/IP/device details and the current doctor's name. Real audit events without patient details are assigned to the first patient from an unfiltered patient query; all real events are marked success and many action types map incorrectly.

**Repair:** use actual events only and leave unknown patient/device fields empty. Preserve action/outcome semantics. CSV exports inherit these problems; the frontend additionally omits its selected date range from export parameters.

### 31. Report audit views contain fixed history

`DoctorReports.jsx:884-920` shows a fixed report, physician, abbreviated hash and export event. `ReportDetail.jsx:548-551` synthesizes history entries rather than retrieving the report's audit log.

**Repair:** render actual audit events and identifiers; remove synthetic cryptographic evidence.

### 32. Patient timeline and health summary contain fixed assessment facts

`patient_portal.py:801-886` returns fixed timeline events and health-summary dates/statuses for every patient, including report links such as rep-demo-01 and rep-demo-pcos. This can disagree with real patient scans and lead to nonexistent reports.

**Repair:** derive events from the patient's actual records and each module's summary from its latest relevant scan, or show not assessed.

### 33. Verification/status handlers do not reliably report missing records

`admin.py:699-733` catches failures as demo success; an invalid UUID can additionally leave doc unassigned and fail during audit logging. The doctor status handler similarly returns success when no matching doctor exists.

**Repair:** validate IDs, return 404 for absent records, roll back failed transactions, and audit actual outcomes only.

## UI consistency, navigation and feedback

### 34. Global search bars are decorative

Common doctor/admin/patient layouts store a search string and pass it to the topbar, but do not search, navigate, or pass it into page data queries. Page-specific searches are separate. Doctor Appointments' “All Doctors” select also has no state/change handler.

**Repair:** implement clearly scoped search or remove the control. Avoid selectable filters that do nothing.

### 35. Exposed unfinished controls and stale identity defaults

DoctorPatients' Bulk Import/More Filters and NewPatient's SMS credentials action show coming-soon toasts. Report email/SMS controls are disabled as coming soon. `/register/doctor` remains a placeholder. Doctor/patient topbars fall back to specific demo people and IDs; the admin identity is hardcoded. Doctor login variants are still imported although routes use unified login. Layout/AuthContext duplicate paths mostly re-export the same implementation, so they are aliases, not separate functioning systems.

**Repair:** choose a supported feature set, remove/hide incomplete actions, use neutral loading/missing identity states and consolidate obsolete routes/imports without deleting compatibility aliases blindly.

### 36. Failed requests can look like endless loading or normal empty data

PatientReportDetail catches a failure but renders a spinner whenever report is null. PatientProfile does the same for profile. Several dashboards merely log failures and then render missing/default data; patient detail/list requests have uncaught rejection paths. ScanShare renders error messages in a green success toast with a checkmark.

**Repair:** standardize loading/empty/error/retry states and distinguish successful actions from failed actions.

### 37. Styling varies by page instead of following a shared system

Topbars use different search radii (doctor rounded-lg, admin rounded-xl, patient rounded-2xl), typography and notification panels. Risk badges have different color definitions, padding and labels. Content spacing differs by portal; toasts range from browser alerts to inline green banners and floating cards. Many forms/tables/modal patterns are independently implemented.

**Repair:** define shared tokens and components for buttons, fields, tables, status/risk badges, dialogs, page headers and feedback. Preserve deliberate role-specific content while unifying common interaction patterns. These are source-observed differences; their precise visual impact needs browser inspection.

### 38. Some UI classes have no configured styling

The project uses classes such as animate-in/fade-in/slide-in-from-top-* without an animation plugin, and utilities such as shadow-xs, shadow-2xs, rounded-xs, focus:outline-hidden and backdrop-blur-xs that are not part of this configured Tailwind 3 system. index.css contains only the Tailwind directives; plugins is empty.

**Repair:** use supported utilities or explicitly define the intended styles. This explains some missing polish rather than a data-flow failure.

### 39. Narrow screens and keyboard interaction need consistent treatment

Layouts default to an open 220px sidebar even on narrow viewports. Fixed-width notification menus, dense small typography and wide tables need real viewport testing. Representative dialogs lack a shared focus trap, Escape handling and accessible labeling; many icon controls suppress focus styling or lack clear accessible labels.

**Repair:** introduce a responsive sidebar and an accessible shared dialog/menu pattern. Verify desktop/mobile layouts and keyboard flows. Exact clipping/overlap is not claimed as browser-confirmed.

## Deployment, maintainability and unnecessary project complexity

### 40. Docker points requests at the wrong API prefix

docker-compose.yml sets VITE_API_BASE_URL to http://localhost:8000, whereas service URLs start /auth, /doctor and /patient and backend routes start /api. The fallback in api.js includes /api; the Docker override does not. Docker also starts the Vite development server, exposing development UI such as DevTestingPanel rather than a production deployment.

**Repair:** align the API base URL and deploy a production build with appropriate API/upload routing.

### 41. Build success does not exercise the interactions above

package.json provides build/lint but no frontend test command; lint currently lacks configuration. App.jsx imports every portal page eagerly, generating one large JavaScript bundle. Backend tests include suites tied to demo accounts and the configured database instead of uniformly isolated fixtures.

**Repair:** restore lint, add targeted workflow tests for the actual failures, isolate test storage, and load portal pages on demand. Do not use the existing build as proof of functional completion.

### 42. Database/startup behavior can conceal configuration problems

database.py silently falls back from failed PostgreSQL connection to local SQLite, probes WSL and runs ad-hoc schema alterations. main.py also creates tables while Alembic migrations exist. Multiple launchers use different locations and forcibly clear shared ports. This makes the active database/schema and startup behavior hard to predict.

**Repair:** make database mode explicit, use one migration/startup path and one launcher. Review old evaluation scripts, duplicated launchers, generated distributions, caches and backups before cleanup; files are not unnecessary solely because their names are similar.

## Repair order

1. **Integrity/access:** password bypass, protected file serving, report locks/signing, real session revocation and honest 2FA state.
2. **Core workflow:** correct module routing; patient-scoped draft state; one scan API; retained/analyzed image views; consistent follow-up and sharing behavior.
3. **Truthful data/actions:** remove synthetic activity/audit/notification/profile facts; implement or disable backups, messaging tests, settings and maintenance actions.
4. **UI system:** shared typography/spacing/components, consistent status/error/loading behavior, responsive navigation and accessible dialogs.
5. **Verification/release:** isolated workflow tests, model-mode/threshold checks, correct deployment configuration and a browser walkthrough for all three roles.

## Acceptance checks for the repaired app

- Wrong passwords fail even for demo accounts; revoked sessions cannot refresh.
- A signed report remains signed and immutable after approval/sharing; sharing an unsigned draft is rejected.
- Every patient file requires authorized access; another account cannot fetch it.
- Cervical/PCOS module identity survives analysis -> results -> report -> share -> PDF.
- Switching patients never transfers inputs/files; saved drafts resume the same record.
- Every displayed image and finding has an actual source; absent artifacts are labeled unavailable.
- Notification, profile, activity and audit screens display real records and missing-data states.
- Settings survive reload and affect the promised behavior; unsupported controls are absent.
- Delivery/backup/maintenance success can be independently verified by the operation's real result.
- Every screen has loading, empty, failure and retry behavior; key flows work by keyboard and on narrow screens.

## Remaining verification limits

No live visual walkthrough, real email/SMS send, backup restore, full clinical-model evaluation, PostgreSQL/Docker run or full backend integration suite was performed. Pixel-level alignment, actual installed-provider configuration and external compliance claims remain unverified. The source defects above do not depend on those checks to be actionable.
