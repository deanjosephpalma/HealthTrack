# BLACK BOX TESTING SHEET

## HEALTH TRACK: Rural Health Unit Patient and Staff Management System

### Instructions

- The tester must complete the tester information before testing.
- Mark each step as Pass or Fail based on the expected result.
- If a step fails, write the actual result and describe the observed problem.
- Use test accounts and fictional patient data only.
- This localhost version does not require email or SMS verification.

| Tester Information | Details |
| --- | --- |
| Tester's Name | ______________________________________________ |
| Date Tested | ______________________________________________ |
| Current Job/Role | ______________________________________________ |
| Years of Working Experience | ______________________________________________ |
| Browser/Device | ______________________________________________ |
| Environment/Version | ______________________________________________ |

---

## Test the Patient Homepage and Services

| Test Case ID | PT-TC-01 |
| --- | --- |
| Test Case Description | Verify that the patient homepage loads correctly, displays available RHU services, and provides usable navigation to registration, login, queue, service status, and patient records. |
| Test Scenario | Patient Homepage and Service Selection |
| Precondition | The patient portal is accessible. The tester has a supported browser or mobile device and a valid patient account when a signed-in page is required. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open the patient portal homepage while signed out. | The homepage loads successfully without broken content or console-visible blocking errors. |  | [ ] Pass / [ ] Fail |
| 2 | Scroll through the homepage and inspect the available services and navigation items. | Services and navigation labels are readable, complete, and clickable. |  | [ ] Pass / [ ] Fail |
| 3 | Select a service such as Outpatient Consultation, Animal Bite, TB, or a Citizens Charter service. | The selected service opens or is selected correctly without displaying another service's information. |  | [ ] Pass / [ ] Fail |
| 4 | Select the login or register action. | The correct authentication page opens. |  | [ ] Pass / [ ] Fail |
| 5 | Reload the homepage using a mobile viewport. | The page remains responsive and usable without horizontal overflow, clipped text, or overlapping controls. |  | [ ] Pass / [ ] Fail |

---

## Test Patient Registration and Username Login

| Test Case ID | PT-TC-02 |
| --- | --- |
| Test Case Description | Verify that a new patient can register using valid information, receive a generated username, and use the username and password to access the patient portal. |
| Test Scenario | Patient Registration and Username-Based Authentication |
| Precondition | Registration and API services are available on localhost. The tester has a new test phone number and uses fictional patient information. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open the Register page and submit the form without entering data. | Required-field validation appears and no account is created. |  | [ ] Pass / [ ] Fail |
| 2 | Enter valid first name, last name, phone, birthdate, address, municipality, barangay, and a strong matching password. | The form accepts valid values and shows no validation error. |  | [ ] Pass / [ ] Fail |
| 3 | Submit the completed registration form. | Registration succeeds and a generated patient username is displayed. |  | [ ] Pass / [ ] Fail |
| 4 | Select PWD, leave the disability type blank, and submit; then select Other without entering details. | Submission is blocked until the required PWD information is complete. |  | [ ] Pass / [ ] Fail |
| 5 | Record the generated username and sign in using the username and registration password. | The patient can log in successfully and is taken to the patient dashboard. |  | [ ] Pass / [ ] Fail |
| 6 | Try to register again using a duplicate phone number or duplicate account information. | The duplicate account is rejected or clearly handled; an additional account is not created. |  | [ ] Pass / [ ] Fail |

---

## Test Patient Login and Logout

| Test Case ID | PT-TC-03 |
| --- | --- |
| Test Case Description | Verify that registered patients can log in using their username, remain restricted to their own portal, and log out securely. Password resets are handled by the Admin Dashboard. |
| Test Scenario | Patient Authentication and Session Management |
| Precondition | A registered patient test account exists. The Admin Dashboard is used for password reset testing. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Enter the generated patient username and password, then select Sign In. | The patient is taken to the patient dashboard with the correct name or identity. |  | [ ] Pass / [ ] Fail |
| 2 | Enter an incorrect password and submit. | Login fails with a safe error and no protected patient data is displayed. |  | [ ] Pass / [ ] Fail |
| 3 | Open the patient portal using a protected page while signed out. | The user is redirected to the patient login page and protected data is not displayed. |  | [ ] Pass / [ ] Fail |
| 4 | Sign in successfully, open logout, and cancel the confirmation. | The patient remains signed in and can continue using the portal. |  | [ ] Pass / [ ] Fail |
| 5 | Confirm logout, then try to open the dashboard again. | The session ends and the dashboard cannot be accessed without signing in again. |  | [ ] Pass / [ ] Fail |

---

## Test Patient Service Intake and Queue

| Test Case ID | PT-TC-04 |
| --- | --- |
| Test Case Description | Verify that patients can complete service intake, join a queue, view a queue ticket, and receive updated queue statuses. |
| Test Scenario | Patient Service Enrollment and Queue Tracking |
| Precondition | A registered patient account is available. At least one service is configured. A Doctor, Nurse, BHW, or Volunteer test account is available for status updates. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Select a service and open Service Info/Service Intake. | The correct service details and required fields are displayed. |  | [ ] Pass / [ ] Fail |
| 2 | Submit the intake form with required fields blank. | Submission is blocked and missing fields are identified. |  | [ ] Pass / [ ] Fail |
| 3 | Complete valid intake data and submit. | The intake is saved and the service request status is displayed. |  | [ ] Pass / [ ] Fail |
| 4 | Select Get in Line/Join Queue once. | A queue ticket is created with the correct service prefix, queue number, and Waiting status. |  | [ ] Pass / [ ] Fail |
| 5 | Try to join the same active service queue again. | Duplicate active tickets are prevented or clearly handled; the original ticket remains traceable. |  | [ ] Pass / [ ] Fail |
| 6 | Refresh the dashboard and open My Queue. | The ticket remains visible with the correct service, number, and status. |  | [ ] Pass / [ ] Fail |
| 7 | Have staff change the ticket to Next, Called, Skipped, and Completed as applicable. | The patient view shows the corresponding readable status after refresh. |  | [ ] Pass / [ ] Fail |

---

## Test Patient Documents and Offline Behavior

| Test Case ID | PT-TC-05 |
| --- | --- |
| Test Case Description | Verify that patients can attach service documents and that queue/document changes are retained safely while offline and synchronized after reconnection. |
| Test Scenario | Patient Documents and Offline Synchronization |
| Precondition | The patient is signed in and has an active service request. The browser/device supports file selection and offline mode can be simulated. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open the service request and locate My Documents/Attach File. | The document panel and attach control are displayed without breaking the page. |  | [ ] Pass / [ ] Fail |
| 2 | Attach a valid PDF, JPG, or PNG test file. | The file appears in the list with Pending or Synced status. |  | [ ] Pass / [ ] Fail |
| 3 | Turn off the network and attach or update a supported item. | The action remains visible locally and indicates that it is pending synchronization. |  | [ ] Pass / [ ] Fail |
| 4 | Restore the network and wait for automatic synchronization. | The pending item is uploaded/synchronized and its status changes to Synced. |  | [ ] Pass / [ ] Fail |
| 5 | Sign out and sign in as a different patient on the same device. | The previous patient's documents, queue, and records are not visible to the new patient. |  | [ ] Pass / [ ] Fail |

---

## Test Staff Login and Role Permissions

| Test Case ID | ST-TC-01 |
| --- | --- |
| Test Case Description | Verify that approved staff can log in to the staff portal and that Doctor, Nurse, BHW, and Volunteer permissions are enforced. |
| Test Scenario | Staff Authentication and Role-Based Access |
| Precondition | Approved Doctor, Nurse, BHW, and Volunteer accounts exist. The staff portal and API are available. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open the staff portal while signed out. | The staff login page is displayed and no dashboard data is visible. |  | [ ] Pass / [ ] Fail |
| 2 | Sign in as Doctor using valid credentials. | The Doctor dashboard opens with Doctor-allowed modules. |  | [ ] Pass / [ ] Fail |
| 3 | Sign in as Nurse using valid credentials. | The Nurse dashboard opens with Queue, Service Desk, Inventory, Reports, Workflow, and other allowed modules. |  | [ ] Pass / [ ] Fail |
| 4 | Sign in as BHW and then Volunteer. | Each account opens the encoder dashboard and Encode Desk only. |  | [ ] Pass / [ ] Fail |
| 5 | Try to access a route not allowed for the current role by typing its URL. | Access is denied or redirected and restricted data/actions are not rendered. |  | [ ] Pass / [ ] Fail |
| 6 | Sign out, press browser Back, and reopen a protected URL. | Protected content is not usable without signing in again. |  | [ ] Pass / [ ] Fail |

---

## Test Queue and Encode Desk

| Test Case ID | ST-TC-02 |
| --- | --- |
| Test Case Description | Verify that encoders can encode patient visits and that Doctor/Nurse staff can manage the queue, create walk-in tickets, and update statuses. |
| Test Scenario | Staff Encoding and Queue Management |
| Precondition | An approved encoder account and Doctor/Nurse account exist. Services are configured. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open Encode Desk as BHW or Volunteer. | The Encode Desk loads and displays the appropriate patient/visit controls. |  | [ ] Pass / [ ] Fail |
| 2 | Submit incomplete patient or visit information. | Validation blocks the save and no invalid partial queue record is created. |  | [ ] Pass / [ ] Fail |
| 3 | Encode a patient using valid data and issue a queue number. | The visit is saved and the patient becomes traceable in the queue. |  | [ ] Pass / [ ] Fail |
| 4 | Open Queue as Nurse or Doctor. | Active and completed queue entries display the correct patient, service, number, and status. |  | [ ] Pass / [ ] Fail |
| 5 | Create a valid walk-in using name, phone, reason, and service. | A ticket is created with the selected service prefix and appears in the active queue. |  | [ ] Pass / [ ] Fail |
| 6 | Submit a walk-in with a blank name or invalid information. | Ticket creation is blocked with an actionable error. |  | [ ] Pass / [ ] Fail |
| 7 | Change a queue entry through the supported statuses. | Each status persists after refresh and is reflected in the patient view. |  | [ ] Pass / [ ] Fail |

---

## Test Clinical Records and Service Workflow

| Test Case ID | ST-TC-03 |
| --- | --- |
| Test Case Description | Verify that authorized clinical staff can search patient records, save consultation information, process service workflow steps, and archive completed work. |
| Test Scenario | Patient Records and Workflow Processing |
| Precondition | A Doctor or Nurse account, test patient, service request, and workflow steps are available. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Search Patient Records by exact and partial patient name/identifier. | Matching records are displayed and unrelated records are excluded. |  | [ ] Pass / [ ] Fail |
| 2 | Create or edit a consultation using valid demographics, vitals, diagnosis, prescription, and notes. | The record saves and the values remain correct after refresh. |  | [ ] Pass / [ ] Fail |
| 3 | Submit incomplete or invalid clinical data. | Save is blocked with validation and existing data is not overwritten incorrectly. |  | [ ] Pass / [ ] Fail |
| 4 | Open Workflow Management and filter Active, Completed, Cancelled, and service type. | Results match the selected filters and archived workflows are excluded. |  | [ ] Pass / [ ] Fail |
| 5 | Open an active workflow, enter valid step data, and save a draft. | Draft data persists without incorrectly completing the step. |  | [ ] Pass / [ ] Fail |
| 6 | Complete a step as the assigned role. | The step is completed, the next state is correct, and the update remains after refresh. |  | [ ] Pass / [ ] Fail |
| 7 | Open a step assigned to a different role as Doctor. | The Doctor cannot edit or complete an unauthorized active step. |  | [ ] Pass / [ ] Fail |
| 8 | Archive a workflow, cancel the confirmation, then archive and confirm. | Cancel keeps the workflow active; confirmation moves it to Archive. |  | [ ] Pass / [ ] Fail |

---

## Test Reports, Inventory, Follow-ups, and Archive

| Test Case ID | ST-TC-04 |
| --- | --- |
| Test Case Description | Verify that authorized staff can use operational modules, export reports, view follow-ups, and restore archived records. |
| Test Scenario | Staff Operations and Data Reporting |
| Precondition | A Nurse or other authorized account exists. Test inventory, report, follow-up, and archived data are available. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open Inventory as Nurse and inspect item quantities and low-stock indicators. | Inventory data loads and low-stock indicators are accurate. |  | [ ] Pass / [ ] Fail |
| 2 | Make a supported inventory update and refresh. | The updated quantity persists and no unrelated item is changed. |  | [ ] Pass / [ ] Fail |
| 3 | Open Reports and wait for metrics and analytics to load. | Counts, trends, diagnoses, queue information, and errors are displayed in a controlled way. |  | [ ] Pass / [ ] Fail |
| 4 | Export a morbidity CSV using valid From and To dates. | A CSV is downloaded with the selected date range and expected columns. |  | [ ] Pass / [ ] Fail |
| 5 | Set From later than To or leave a date blank, then export. | Export is blocked with a clear date validation message. |  | [ ] Pass / [ ] Fail |
| 6 | Open Follow-ups and update a supported follow-up. | The correct patient's follow-up status is updated and persists after refresh. |  | [ ] Pass / [ ] Fail |
| 7 | Open Archive and switch Patients, Appointments, Queue, Records, and Workflows. | Counts and rows match each archive tab and retention information is shown. |  | [ ] Pass / [ ] Fail |
| 8 | Restore an archived item, first cancelling and then confirming. | Cancel leaves it archived; confirm restores it to the correct active list. |  | [ ] Pass / [ ] Fail |

---

## Test Account Management and Security

| Test Case ID | ST-TC-05 |
| --- | --- |
| Test Case Description | Verify that only the configured account manager can open the Admin Dashboard account directory and reset account passwords, and that patient health information is protected. |
| Test Scenario | Account Administration and Security Controls |
| Precondition | The Admin Dashboard is available. A configured account manager, non-manager staff account, and target patient/staff test accounts exist. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open Accounts as a non-manager staff account. | Access is denied and the account directory is not loaded. |  | [ ] Pass / [ ] Fail |
| 2 | Open the Admin Dashboard Accounts page as the configured account manager. | Staff and patient account records load with the correct account type, role, name, username, and phone. |  | [ ] Pass / [ ] Fail |
| 3 | Search by name, username, phone, and role and apply All/Staff/Patients filters. | Search results and counts update correctly; clearing search restores the list. |  | [ ] Pass / [ ] Fail |
| 4 | Select a target account and reset its password using a valid new password. | The Admin Dashboard confirms the reset and shows the updated account/password state according to the system design. |  | [ ] Pass / [ ] Fail |
| 5 | Sign in as the target account using the new password. | The target account can log in successfully with the admin-set password. |  | [ ] Pass / [ ] Fail |
| 6 | Submit a blank or invalid password in the Admin Dashboard reset control. | Reset is blocked or an error appears; the existing password remains unchanged. |  | [ ] Pass / [ ] Fail |
| 7 | Change a patient record URL/ID to another patient's ID while signed in. | Access is denied or no data is returned; another patient's PHI is never shown. |  | [ ] Pass / [ ] Fail |
| 8 | Switch accounts in the same browser after using the first account offline. | Cached queue, documents, and records from the first account are cleared or inaccessible. |  | [ ] Pass / [ ] Fail |

---

## Test Responsive Layout and Error Recovery

| Test Case ID | QA-TC-01 |
| --- | --- |
| Test Case Description | Verify that both portals remain usable on desktop and mobile devices and recover safely from loading, network, session, and API errors. |
| Test Scenario | Responsive Design, Accessibility, and Recovery |
| Precondition | Both portals are accessible. Desktop and mobile viewport/device are available. Network can be interrupted. |

| Step No. | Step Details | Expected Result | Actual Result | Status (Pass/Fail) |
| --- | --- | --- | --- | --- |
| 1 | Open login, dashboard, forms, tables, dialogs, and queue pages at desktop width. | Content is readable and controls do not overlap or become clipped. |  | [ ] Pass / [ ] Fail |
| 2 | Repeat the same pages at approximately 390px mobile width. | Pages remain responsive without horizontal overflow or unusable controls. |  | [ ] Pass / [ ] Fail |
| 3 | Use keyboard navigation on login, form, modal, tabs, and action buttons. | Focus order is usable and all important controls can be reached and activated. |  | [ ] Pass / [ ] Fail |
| 4 | Disconnect the network while loading or saving a supported action. | The system shows a controlled offline/error state and does not falsely report an unsaved action as complete. |  | [ ] Pass / [ ] Fail |
| 5 | Restore the network and retry or wait for synchronization. | The system recovers where possible without creating duplicate records or queue tickets. |  | [ ] Pass / [ ] Fail |
| 6 | Expire or invalidate the session and access a protected page. | The user is redirected to login or receives a controlled authorization error; stale protected data is not exposed. |  | [ ] Pass / [ ] Fail |

---

## Overall Test Result

| Result | Count/Details |
| --- | --- |
| Total test cases | 11 |
| Passed | ____________________ |
| Failed | ____________________ |
| Blocked | ____________________ |
| Not Run | ____________________ |
| Critical/High defects | ____________________ |
| Overall recommendation | Pass / Pass with Conditions / Fail |

### Tester Comments

________________________________________________________________________________

________________________________________________________________________________

________________________________________________________________________________

| Approval | Name | Signature | Date |
| --- | --- | --- | --- |
| Tester |  |  |  |
| RHU Representative |  |  |  |
| Project Owner |  |  |  |
