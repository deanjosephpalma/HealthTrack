# Emergency nurse intake

Apply `emergency_triage.sql` in the Supabase SQL Editor after the existing workflow and BHW walk-in migrations. Alternatively configure `DATABASE_URL` or `SUPABASE_DB_URL` in `.env.seed` and run `node scripts/apply-emergency-triage.mjs` from HealthTrackWEB. Apply once; the SQL transaction rolls back on failure.

The active Nurse profile with email `zuleika.jacosalem@healthtrack.com` receives the emergency home dashboard. No account or password is created or changed. Database policies restrict direct encoding, care updates, and threshold settings to that account. BHW/Volunteer staff can see their intake referrals; other nurses do not gain emergency-case access.

Automatic referral starts disabled. Nurse Zuleika must enter RHU-approved systolic, diastolic, and temperature thresholds and enable it on the dashboard. Meeting any cutoff (inclusive) triggers referral when encoding is saved. These configurable rules are not a complete clinical triage protocol; below-threshold values do not establish that a patient is safe. BHW staff can select the urgent-referral checkbox regardless of readings. Emergency intake permits incomplete routine fields to avoid requiring full routine registration before referral.

Direct emergency cases require a patient display name and incident description; vital signs are optional. Use “Unidentified patient” when necessary. These cases are stored separately and do not automatically create a longitudinal patient record. BHW cases remain linked to their existing patient and service request. The original encoded request is retained and marked `intake_data.emergency_referred`; the BHW line excludes it. Queue inserts and request queue linking are blocked for referred cases. Closed emergency cases stay in history and do not automatically re-enter the regular queue.

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
