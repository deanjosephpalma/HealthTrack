import { jsPDF } from 'jspdf'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const outputPath = resolve('..', 'docs', 'HealthTrack-System-Manual.pdf')
mkdirSync(dirname(outputPath), { recursive: true })

const doc = new jsPDF({ unit: 'mm', format: 'a4' })
const pageWidth = 210
const pageHeight = 297
const margin = 18
const contentWidth = pageWidth - margin * 2
let y = 22

function footer() {
  const page = doc.getNumberOfPages()
  doc.setDrawColor(20, 116, 110)
  doc.line(margin, 284, pageWidth - margin, 284)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(93, 111, 116)
  doc.text('HealthTrack · RHU Pila System Manual', margin, 289)
  doc.text(`Page ${page}`, pageWidth - margin, 289, { align: 'right' })
}

function newPage() {
  footer()
  doc.addPage()
  y = 22
}

function ensure(space) {
  if (y + space > 278) newPage()
}

function paragraph(text, { bullet = false } = {}) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(38, 57, 63)
  const prefix = bullet ? '• ' : ''
  const lines = doc.splitTextToSize(`${prefix}${text}`, contentWidth - (bullet ? 2 : 0))
  ensure(lines.length * 5.3 + 3)
  doc.text(lines, margin, y)
  y += lines.length * 5.3 + 3
}

function heading(text, level = 2) {
  ensure(level === 1 ? 18 : 13)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(level === 1 ? 19 : 13)
  doc.setTextColor(14, 105, 101)
  doc.text(text, margin, y)
  y += level === 1 ? 10 : 8
  doc.setDrawColor(235, 121, 93)
  doc.setLineWidth(0.7)
  doc.line(margin, y, level === 1 ? margin + 72 : margin + 45, y)
  y += 7
}

function steps(items) {
  items.forEach((item, index) => paragraph(`${index + 1}. ${item}`))
}

doc.setFillColor(14, 105, 101)
doc.rect(0, 0, pageWidth, 72, 'F')
doc.setFillColor(235, 121, 93)
doc.rect(0, 72, pageWidth, 4, 'F')
doc.setFont('helvetica', 'bold')
doc.setTextColor(255, 255, 255)
doc.setFontSize(27)
doc.text('HEALTHTRACK', margin, 31)
doc.setFontSize(16)
doc.text('System Manual', margin, 43)
doc.setFont('helvetica', 'normal')
doc.setFontSize(11)
doc.text('Digital Health Service Management System', margin, 54)
doc.text('Rural Health Unit of Pila, Laguna', margin, 61)
y = 95
heading('Purpose', 1)
paragraph('This manual guides patients and RHU Pila staff in using HealthTrack for service access, queue management, consultations, records, follow-ups, reporting, and heat-map monitoring.')
heading('Roles at a Glance')
paragraph('Patient — access services, queue tickets, records, and follow-ups.', { bullet: true })
paragraph('BHW / Volunteer — encode patients and issue queue numbers.', { bullet: true })
paragraph('Nurse — manage queues, nurse-led services, records, inventory, and workflows.', { bullet: true })
paragraph('Doctor — complete consultations and create applicable follow-up schedules.', { bullet: true })
paragraph('Account Manager — manage approved user accounts.', { bullet: true })

newPage()
heading('1. Patient Portal', 1)
paragraph('Use the Patient Portal to access RHU services and monitor care progress.')
steps([
  'Register or sign in using your patient account.',
  'Complete the Profile page with accurate personal, contact, and barangay information.',
  'Choose a service from Service Info and complete the required intake details.',
  'Select Get in Line to join the BHW / Volunteer encoding line.',
  'After encoding, open My Queue to view your ticket and live queue status.',
  'Open Service Status to monitor request progress and released documents.',
  'Open Medical Records and Follow-ups to view completed care and schedules.',
])
heading('2. BHW / Volunteer Encode Desk', 1)
steps([
  'Sign in to the Staff Console and open Encode Desk.',
  'Select a patient under Awaiting Encoding.',
  'Verify the profile and complete the required intake information.',
  'Save the encoded information.',
  'Select Get Queue Number to issue a ticket for Doctor Consult or the appropriate service desk.',
])

newPage()
heading('3. Nurse Workflow', 1)
steps([
  'Open Queue to view active tickets and call patients in the appropriate order.',
  'Use Service Desk for nurse-led services such as health cards, permits, and related requests.',
  'Use Patient Records to encode or update authorized clinical information.',
  'Use Inventory to monitor medicine and supply levels.',
  'Use Workflow, Archive, and Reports for operational monitoring.',
])
heading('4. Doctor Consultation', 1)
steps([
  'Open Doctor Consult and select an active doctor-service queue ticket.',
  'Review the patient profile and intake details.',
  'Call the patient when ready.',
  'Record diagnosis, notes, prescription, and required clinical details.',
  'Complete the consultation to save the patient record and close the queue ticket.',
  'Create animal-bite, TB, or outpatient follow-up schedules when applicable.',
])
heading('Queue Statuses')
paragraph('Waiting — active ticket awaiting action. Next — prepared to be called. Called — patient has been called. Skipped — temporarily skipped. Completed / Done — service finished. Cancelled — ticket cancelled.')

newPage()
heading('5. Heat Map and Reports', 1)
paragraph('The Heat Map displays clinical and reported-case patterns by barangay. It supports monitoring of possible disease hotspots and community-health trends.')
steps([
  'Open Heat Map from the Staff Console.',
  'Review map points and barangay-level case patterns.',
  'Apply available clinical or disease filters.',
  'Use Heat Map and Reports information to guide validation, outreach, monitoring, and response planning.',
])
paragraph('Important: Heat-map results are decision-support information only. They do not replace clinical verification or official outbreak-investigation procedures.')
heading('6. Offline Use and Synchronization', 1)
paragraph('Selected queue and record operations can continue during temporary internet interruption. Pending work is stored in the browser and synchronizes once connectivity returns. Keep the browser open and do not clear browser data before pending work has synchronized.')
heading('7. Security and Good Practice', 1)
paragraph('Use only your assigned account; never share passwords.', { bullet: true })
paragraph('Verify patient identity before encoding or consulting.', { bullet: true })
paragraph('Enter complete and accurate information, then sign out on shared devices.', { bullet: true })
paragraph('Do not disclose patient records outside authorized RHU work.', { bullet: true })

newPage()
heading('8. Quick Troubleshooting', 1)
heading('Queue ticket is not visible')
paragraph('Refresh the Queue page, confirm that encoding was completed, and check internet connectivity.')
heading('Changes are pending sync')
paragraph('Reconnect to the internet, keep the browser open, and wait for synchronization to finish.')
heading('Patient cannot access a record')
paragraph('Confirm the patient profile is linked to the correct account and that the consultation was completed.')
heading('Heat Map has no results')
paragraph('Check date and disease filters. Confirm that clinical or reported-case data was saved with barangay information.')
heading('Support', 1)
paragraph('For operational support, contact the authorized RHU Pila system administrator.')
doc.setFillColor(14, 105, 101)
doc.roundedRect(margin, y + 8, contentWidth, 25, 3, 3, 'F')
doc.setTextColor(255, 255, 255)
doc.setFont('helvetica', 'bold')
doc.setFontSize(14)
doc.text('HealthTrack · Your Health, Within Reach', pageWidth / 2, y + 23, { align: 'center' })

footer()
doc.save(outputPath)
console.log(`Created ${outputPath}`)
