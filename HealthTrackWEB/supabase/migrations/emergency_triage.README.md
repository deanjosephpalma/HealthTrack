# Emergency nurse intake

## Completed consultation records and expanded intake

Apply `emergency_consultation_records.sql` after `emergency_patient_status_sync.sql`, before deploying the updated staff UI. The new completion RPC atomically creates one `patient_records` row per emergency case and closes the case. Repeated completion requests return the same record. The migration also backfills earlier completed/referred cases. Medical Records and staff Patient Records use this shared table. Completed record snapshots retain vital signs, demographics, contact/address details, reason, and care notes; they are labelled as an emergency nursing assessment.

Emergency Encode supports existing-patient selection or a new staff patient profile, contact number, age, sex, BP, temperature, pulse, respiration, SpO2, height, weight, Pila barangay choices, and an outside-Pila address option. Choose the patient's existing profile to link the record to their portal account. A new/unidentified person without an account gets a staff-visible record; portal visibility requires linking the correct patient profile to that account. Names alone are never used to assign account ownership.

The consultation page has one completion action. Assessment/care notes are required. Routine intake measurements remain optional so incomplete emergency registration does not prevent care. Existing completed notes and vital signs are retained; missing historical measurements are not invented.

Validation: `scripts/test-emergency-records.mjs` uses an isolated local PostgreSQL cluster and synthetic data to check migration reapplication, backfill, repeat completion, record fields, account linkage, BHW status sync, new-patient creation, and authorization. It never reads deployment credentials.

## Patient portal consultation status

Apply `emergency_patient_status_sync.sql` after the queue-link repair. It updates linked service requests atomically when emergency cases are created or their status changes, and backfills existing cases (including completed consultations). Active cases use `In Progress`; completed/transferred cases close the service request as `Completed`, with the precise outcome in `intake_data.emergency_status`. Clinical notes remain in the emergency table. Deploy the Patient Portal changes to display referral, care, completion, and transfer messages in My Queue and Service Status. Recent emergency visits remain visible in My Queue after the active enrollment closes. The base emergency migration now includes the same triggers for new installations.

## Repair: missing service_request_id column

If BHW encoding or queue issuance reports `column "service_request_id" does not exist`, apply `emergency_triage_queue_link_fix.sql` in Supabase SQL Editor. The original migration referenced `queue.service_request_id` without creating it. The repair adds that link, backfills unambiguous existing request links, and reloads the API schema cache. Apply this repair before deploying the updated queue sync client, then retry the existing patient's queue action. Do not rerun the original migration on an already installed database: its policies and triggers already exist.

Apply `emergency_triage.sql` in the Supabase SQL Editor after the existing workflow and BHW walk-in migrations. Alternatively configure `DATABASE_URL` or `SUPABASE_DB_URL` in `.env.seed` and run `node scripts/apply-emergency-triage.mjs` from HealthTrackWEB. Apply once; the SQL transaction rolls back on failure.

The active Nurse profile with email `zuleika.jacosalem@healthtrack.com` receives the emergency home dashboard. No account or password is created or changed. Database policies restrict direct encoding, care updates, and threshold settings to that account. BHW/Volunteer staff can see their intake referrals; other nurses do not gain emergency-case access.

Automatic referral starts disabled. Nurse Zuleika must enter RHU-approved systolic, diastolic, and temperature thresholds and enable it on the dashboard. Meeting any cutoff (inclusive) triggers referral when encoding is saved. These configurable rules are not a complete clinical triage protocol; below-threshold values do not establish that a patient is safe. BHW staff can select the urgent-referral checkbox regardless of readings. Emergency intake permits incomplete routine fields to avoid requiring full routine registration before referral.

Direct emergency cases require a patient display name and incident description; vital signs are optional. Use “Unidentified patient” when necessary. With the consultation-record migration applied, direct encoding links or creates a patient profile, and completion creates a longitudinal patient record. BHW cases remain linked to their existing patient and service request. The original encoded request is retained and marked `intake_data.emergency_referred`; the BHW line excludes it. Queue inserts and request queue linking are blocked for referred cases. Closed emergency cases stay in history and do not automatically re-enter the regular queue.

The dashboard polls every ten seconds. Emergency actions require an online database connection. Apply the migration before using this feature.

## Nurse consultation and priority queue

Zuleika's Queue page reads active emergency referrals instead of the regular queue. It includes automatic elevated-vitals referrals and manual BHW referrals whose readings meet the configured thresholds. Automatic referrals remain eligible when thresholds change. Accidents and other manual emergencies are available directly in Nurse Consult, even when they are not in the high-vitals list. Other nurses retain the regular Queue page.

Nurse Consult is restricted to Zuleika's account and saves assessment/care/referral notes and case status through the existing emergency-case RPC. It includes completed/referred consultation history. No additional migration is needed for this page beyond `emergency_triage.sql`.

## Acceptance checks after applying SQL

- Sign in as Zuleika: emergency home page, direct encoding, start care, notes, completion, referral and history.
- Another nurse cannot query cases or modify cutoffs; BHW cannot insert direct cases or modify care status.
- With approved cutoffs enabled, save an existing patient and a new BHW walk-in at each exact cutoff, above it, and below all cutoffs. Either BP component triggers independently.
- Elevated or manually urgent intake appears in the emergency dashboard, disappears from the BHW line, and has no queue ticket. Repeated saves do not duplicate cases.
- Normal intake continues through save and queue issuance. Manual urgent intake works while automatic thresholds are disabled.
- A stale queue-issuance screen cannot create a ticket for an already referred request.
- Simulate a connection failure: the UI must report an error and must not claim that an emergency case was saved.
