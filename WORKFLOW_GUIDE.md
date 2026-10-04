# AuraMed workflow and presentation guide

## What changed

The central problem was a mixture of real records, temporary page state, and demonstration placeholders inside the same workflow. Navigation could discard work, a report could lose its signed protection after sharing, and patient appointment actions could show success without updating the appointment. The demo launcher also reset the database on each restart.

The core workflows now have consistent parent Back links and dashboard links, a four-step screening flow, account-scoped drafts, server-saved scan inputs and images, and refreshes after changes or when returning to a tab. Important clinical screens, the three screening modules, risk presets, reports, referrals, recalls, and role portals remain available.

## Present the app in this order

### 1. Doctor: from patient to follow-up

1. Choose **New examination** from Today or the sidebar. Select an existing demonstration patient, then choose Breast, Cervical or PCOS. Every doctor can use all three.
2. In **Prepare**, open **Try a demo case** and choose low, medium or high risk. The image and clinical inputs load together. Breast cases include paired MLO/CC images matched from CBIS-DDSM metadata. The low-risk cervical image comes from SIPaKMeD's Superficial-Intermediate class. All nine cases pass the existing image-quality checks. Risk labels describe the input presets, not guaranteed model outputs.
3. Use **Save draft** before changing devices. Inputs, image files and view labels stay with the patient when navigating back and are saved to the server.
4. **Run analysis**, then review the result. Evidence and reference images are expandable. Clinical review and corrections remain available.
5. Choose **Review report**. Open **Edit report** to select and edit a section; the full preview remains below. Save, download or sign. The signing confirmation shows the authenticated doctor's name and registration and requires an acknowledgement. This is recorded physician sign-off, not certificate-based cryptographic signing.
6. **Share & follow-up** contains three clear sections: share the report, plan the next visit, and consider a referral. Optional recipients, included sections and the patient message are expandable. Portal sharing is live; email/SMS report delivery is not presented as an available action.
7. Confirm the suggested follow-up date, proposed time and actual clinic location. Changing the suggested date/time prompts a confirmation. Clinic slot availability is not automatically checked. Returning to this page recognizes the saved booking.
8. After booking, select patient portal, SMS and/or WhatsApp reminders and a lead time. Text reminders require the patient's agreement and recorded phone number. Save the preferences. A portal booking confirmation is separate from the later reminder.
9. Open **Preview the recall journey**. **Appointment booked** and **Jump to reminder day** demonstrate the notifications without sending anything or changing the appointment. The saved appointment supplies the patient, date, time and location.
10. High/critical results suggest considering specialist referral; the doctor chooses the specialist and urgency. Other results retain manual referral. External specialist delivery is not claimed.
11. **More tools → Reminders** manages booked-visit reminders. The existing real-provider demonstration remains under **Advanced messaging delivery test**, with an explicit notice that it sends real messages.

The four steps are **Prepare → Review results → Review & sign → Share & follow-up**. Previous steps retain the scan identity. Signed reports stay locked after sharing. Re-analysis creates a new examination.

New unread notifications are checked every 30 seconds and shown as a dismissible popup. Existing notices remain in the bell menu; the first load does not flood the screen with popups.

### 2. Patient: review and respond

1. Sign in as the patient linked to the doctor's demonstration record.
2. Open **Reports**. The patient sees reports explicitly shared with them; unsigned or unshared reports are not exposed.
3. Open a report to review its actual findings, recommendations, sharing message, and PDF. Back returns to the report list.
4. Open **Appointments**. The calendar highlights the actual upcoming date and exports that visit to a calendar file.
5. Request a new date/time. The portal shows **awaiting doctor confirmation**, while retaining the original confirmed visit. In the doctor's Appointments screen, open the request and confirm the change; returning to the patient portal shows the accepted date.
6. Cancel a visit when needed. The appointment record changes and the treating doctor receives an in-app notification.
7. Edit **Profile** contact details and notification choices, then save. Unsaved edits survive navigation; saved preferences are returned by the server.
8. Review **Timeline**. Unassessed modules display **Not assessed** rather than a fabricated normal result.

### 3. Admin: oversight

1. Review **Dashboard** counts and screening charts. They come from the database, including genuine zero counts.
2. Open **Doctors** to review pending verification and existing registered doctors.
3. Review **Patients**, **Scans**, **Reports**, and **Appointments** for the same saved records.
4. Review **Data Requests** and **Audit Logs**. Pending action badges use actual counts.
5. Review **Settings**. Edited settings and the selected tab survive leaving and returning; save applies the configuration.
6. Review **System Status**. Database/storage checks and model loading are distinguished from email configuration and unverified backup status. Invented latency, uptime, and system activity notices have been removed from the dashboard.

## How retained work works

| Work | Where it is retained | What to do |
|---|---|---|
| Unsubmitted form edits, tabs, filters | Current account's browser session | Navigate back or reopen the page in the same tab. Use Save to commit editable records. |
| Workbench images before Save Draft | Browser storage, with an in-memory fallback | Use Save Draft before changing devices or clearing browser data. |
| Saved scan drafts, clinical inputs, image views and files | Server database and upload folder | Open the saved draft from the patient record. Repeated Save Draft updates that draft. |
| Signed reports, shares, appointments, contact preferences | Server database | They are available to authorized roles and refresh on navigation, focus, and same-browser changes. |
| Demonstration records | Persistent `backend/auramed_dev.db` | Restarting the demo server preserves records; it no longer deletes the database. |

Separate browser tabs can retain separate role sessions. Across different devices, return to the screen or refresh to fetch the latest records; this is not a push-based real-time collaboration system. Browser storage is not a substitute for saving work to the server.

## Start and restart for a presentation

Close the existing AuraMed frontend/backend windows, then use `start_auramed.bat` or `start.bat` at the project root. The usual address is `http://localhost:5173`. The local demonstration runner seeds accounts only when initializing a new demonstration database.

| Role | Seeded demonstration login | Password |
|---|---|---|
| Doctor | `testdr1@auramed.com` | `Doctor@123` |
| Patient linked to the first doctor's demonstration patient | `testpatient1@auramed.com` | `Patient@123` |
| Admin | `testadmin1@auramed.com` | `Admin@123` |

These are the demonstration runner's seeded credentials. Existing accounts keep their stored passwords. The previous universal password bypass has been removed.

Restart the backend to load the new workflow code and appointment change-request table. The local app creates missing tables at startup; deployments managed through Alembic should apply migration `0006_appointment_change_requests`. Preserve the database and uploads when moving the demonstration app.

## Boundaries to state during a demonstration

- Portal sharing and in-app appointment notifications are implemented. Email/SMS report sharing is not presented as successful delivery; external channels require their configured services and supported workflows.
- The specialist catalogue is an example directory. A saved referral does not automatically transmit email, raw imaging, or DICOM data.
- Optional share checkboxes control the recipient PDF's clinical summary, imaging, and AI sections. Patient identity, risk, recommendations, limitations, and signature remain included. The portal summary and signed original remain complete.
- AI models, formula calculations, image quality checks, and physician review remain in place. The presets and demonstration images are for illustrating the workflow. This work does not establish clinical validation or regulatory certification.
- The app still has prototype areas beyond these core workflows. The original audit is retained as a historical inventory; it is not a claim that every issue in that audit remains open or that every screen is now production-ready.

## Verification

- Frontend workflow tests cover all nine presets, module route identity, signed legacy report locks, follow-up interval parsing, and returning to the same scan.
- Backend regression tests cover report access/sharing/locks, saved scan images and patient separation, contact preferences, actual admin counts/status, appointment request/confirmation/cancellation, and recipient PDF filtering without changing the signed original.
- A restart regression launches the demonstration runner twice against a temporary database and checks that saved data and account identities survive.
- Browser checks exercised patient registration drafts, workbench inputs/notes/image retention, using a demonstration sample, patient profile edits, and role dashboards against an isolated test database. Real patient records were not used.

For the original source findings, see `PROJECT_AUDIT.md`.

## Reminder operations and deployment

- Migration `0007_appointment_reminders` adds per-appointment channels, lead time and consent. For PostgreSQL deployments, apply the normal Alembic migration before starting the updated backend. The local SQLite demo runner creates missing tables on startup.
- The running backend checks due reminders every 15 minutes and processes queued delivery every 5 minutes. It must remain running; the browser preview does not advance the server clock.
- Appointment cancellation suppresses pending messages. Rescheduling resets the reminder window and cancels stale queued messages. Saving identical preferences does not queue a duplicate.
- SMS and WhatsApp use the existing Twilio adapters. A successful provider response is shown as **accepted**, not confirmed delivered. Failures remain visible. Trial-template acceptance is identified separately. No live messages were sent during verification.
- Test preview uses a separate temporary database, synthetic accounts, and disabled delivery processing. Its sign-offs and appointments are test records, not changes to the presentation database.
- Newly generated reports no longer invent imaging observations or a patient phone number when those values are missing. Existing signed report content is preserved.

## Verification for this redesign

Frontend build and lint passed. Thirteen frontend workflow tests and nineteen backend workflow/image/restart tests passed, including all nine demo cases, reminder consent/ownership, duplicate prevention, cancellation, provider acceptance/failure, sharing protection and fabricated-finding regression. Browser checks covered patient selection, paired demo loading, saving and restoring inputs, physician sign-off, sharing, appointment persistence and the recall preview. Model inference accuracy and live message delivery were not validated by these UI checks.


## Clinic, referrals and returning to the examination

- The appointment location starts with the signed-in doctor's saved hospital. If none is recorded, the editable default is AuraMed Clinic. Existing draft locations and booked locations take precedence.
- Referral links carry the exact scan and originating results, report or care-plan page. The referral context and attached report come from that examination, even when the patient has a newer scan.
- After recording a referral, use **Return to examination**. Before saving, the back link preserves the referral draft separately for that scan.
- The care plan displays the saved referral, priority and pending specialist status. Its progress summary distinguishes the completed report handoff from future appointments and specialist responses.
- Patient overview includes links to the care plans for each latest examination.
- Browser verification confirmed clinic autofill, referral recording and return to the same examination, and changing the suggested 10:30 appointment to 11:15 with confirmation and correct persistence. No live SMS or WhatsApp messages were sent.
