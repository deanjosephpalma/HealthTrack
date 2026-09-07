import { jsPDF } from 'jspdf'

const MHO_NAME = 'VIEL ANGELO E. BAMBO, MD.'
const MHO_TITLE = 'Municipal Health Officer'
const SI_NAME = 'THELMA H. SAMSON'
const SI_TITLE = 'Sanitary Inspector'
const MAYOR_NAME = 'ATTY. QUEEN MARILYD S. ALARVA'
const MAYOR_TITLE = 'Municipal Mayor'

function formatDate(value) {
  if (!value) return '________________'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function safeFilePart(text) {
  return String(text || 'Document')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
}

function str(v, fallback = '________________') {
  const t = (v ?? '').toString().trim()
  return t || fallback
}

function ageFromBirthdate(birthdate) {
  if (!birthdate) return ''
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? String(age) : ''
}

function isFoodHandler(details = {}) {
  const raw = `${details.handler_type || details.food_nonfood || details.category || ''}`.toLowerCase()
  if (/non[-\s]?food/.test(raw)) return false
  if (/food/.test(raw)) return true
  return null
}

function drawCentered(doc, text, y, size = 10, style = 'normal') {
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  doc.text(String(text), pageW / 2, y, { align: 'center' })
}

function drawUnderlineField(doc, label, value, x, y, width) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(label, x, y)
  const labelW = doc.getTextWidth(label) + 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const text = str(value, '')
  if (text) doc.text(text, x + labelW, y)
  doc.setDrawColor(40)
  doc.setLineWidth(0.2)
  doc.line(x + labelW, y + 1.2, x + width, y + 1.2)
}

function drawRhuHeader(doc, { officeLine = 'OFFICE OF THE MUNICIPAL HEALTH OFFICER', y = 16 } = {}) {
  const pageW = doc.internal.pageSize.getWidth()
  // Logo placeholders
  doc.setDrawColor(30)
  doc.setLineWidth(0.4)
  doc.circle(28, y + 6, 9)
  doc.setFontSize(6)
  doc.text('SEAL', 28, y + 7, { align: 'center' })
  doc.circle(pageW - 28, y + 6, 9)
  doc.text('DOH', pageW - 28, y + 7, { align: 'center' })

  drawCentered(doc, 'Republic of the Philippines', y, 9, 'normal')
  drawCentered(doc, 'Province of Laguna', y + 4.5, 9, 'normal')
  drawCentered(doc, 'Municipality of Pila', y + 9, 9, 'bold')
  drawCentered(doc, officeLine, y + 14, 10, 'bold')
  return y + 22
}

function drawSignatureBlock(doc, x, y, name, title) {
  doc.setDrawColor(40)
  doc.setLineWidth(0.3)
  doc.line(x, y, x + 55, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(name, x + 27.5, y + 5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(title, x + 27.5, y + 9, { align: 'center' })
}

function drawFooterNote(doc, text) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(90)
  doc.text(text, pageW / 2, pageH - 8, { align: 'center', maxWidth: pageW - 24 })
  doc.setTextColor(0)
}

/** EHS FORM NO. 102-A — Health Certificate (Food / Non-Food) */
function drawHealthCertificate(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  const d = payload.details || {}
  const food = isFoodHandler(d)
  const category = food === false ? 'NON-FOOD' : food === true ? 'FOODS' : 'FOODS / NON-FOOD'
  const name = str(d.applicant_name || payload.patientName, '')
  const age = str(d.applicant_age || payload.patientDetails?.age || ageFromBirthdate(payload.patientDetails?.birthdate), '')
  const sex = str(d.applicant_sex || payload.patientDetails?.sex, '')
  const occupation = str(d.position_or_work || d.occupation, '')
  const nationality = str(d.nationality || 'Filipino', '')
  const placeOfWork = str(
    [d.establishment_name, d.establishment_address].filter(Boolean).join(' — ') ||
      d.place_of_work,
    '',
  )
  const regNo = str(payload.referenceNumber, '')
  const issuedFor = str(
    d.establishment_name || payload.purpose || (food === false ? 'Non-Food Establishment' : 'Food Establishment'),
    '',
  )

  // Outer border
  doc.setDrawColor(20)
  doc.setLineWidth(0.8)
  doc.rect(12, 12, pageW - 24, 273)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Office of the Municipal Health Officer, Pila, Laguna', 18, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('EHS FORM NO. 102-A', pageW - 18, 18, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(120, 40, 20)
  doc.text(category, pageW - 18, 24, { align: 'right' })
  doc.setTextColor(0)

  // 1x1 picture box
  doc.setDrawColor(40)
  doc.setLineWidth(0.4)
  doc.rect(pageW - 42, 28, 24, 28)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('1x1', pageW - 30, 40, { align: 'center' })
  doc.text('PICTURE', pageW - 30, 45, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Reg. No. ${regNo || '____________'}`, 18, 30)

  drawCentered(doc, 'HEALTH CERTIFICATE', 48, 16, 'bold')

  let y = 58
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const preamble =
    'Pursuant to the provision of P.D. 522, P.D. 856 and City/Mun. Ord. No. ______, s. ______, this Certificate is issued for'
  const preambleLines = doc.splitTextToSize(preamble, pageW - 40)
  doc.text(preambleLines, 18, y)
  y += preambleLines.length * 4.5 + 4
  drawUnderlineField(doc, '', issuedFor, 18, y, pageW - 36)
  y += 12

  drawUnderlineField(doc, 'NAME:', name, 18, y, pageW - 36)
  y += 10
  drawUnderlineField(doc, 'OCCUPATION:', occupation, 18, y, pageW - 36)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('AGE:', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(age || '____', 30, y)
  doc.line(30, y + 1.2, 52, y + 1.2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('SEX:', 58, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(sex || '____', 70, y)
  doc.line(70, y + 1.2, 95, y + 1.2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('NATIONALITY:', 102, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(nationality || '________', 132, y)
  doc.line(132, y + 1.2, pageW - 18, y + 1.2)
  y += 12

  drawUnderlineField(doc, 'PLACE OF WORK:', placeOfWork, 18, y, pageW - 36)
  y += 28

  doc.setDrawColor(40)
  doc.line(18, y, 78, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Signature', 48, y + 5, { align: 'center' })

  doc.line(pageW - 78, y, pageW - 18, y)
  doc.text('Sanitary Inspector', pageW - 48, y + 5, { align: 'center' })

  y += 28
  drawSignatureBlock(doc, pageW - 78, y, MHO_NAME, MHO_TITLE)

  y += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Date issued: ${formatDate(payload.issuedAt)}`, 18, y)

  drawFooterNote(doc, 'Generated by HealthTrack RHU Pila · Official Health Certificate (EHS Form No. 102-A)')
}

/** Sanitary Permit — official RHU layout */
function drawSanitaryPermit(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  const d = payload.details || {}
  let y = drawRhuHeader(doc, { officeLine: 'RURAL HEALTH UNIT', y: 14 })

  doc.setTextColor(200, 90, 20)
  drawCentered(doc, 'SANITARY PERMIT', y + 2, 20, 'bold')
  doc.setTextColor(0)
  y += 16

  drawUnderlineField(doc, '', str(d.establishment_name, ''), 25, y, pageW - 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Name of Establishment', pageW / 2, y + 5, { align: 'center' })
  y += 14

  drawUnderlineField(
    doc,
    '',
    str(d.establishment_type || d.nature_of_business || d.business_nature, ''),
    25,
    y,
    pageW - 50,
  )
  doc.text('Nature of Business', pageW / 2, y + 5, { align: 'center' })
  y += 14

  drawUnderlineField(doc, '', str(d.establishment_address || d.address, ''), 25, y, pageW - 50)
  doc.text('Address', pageW / 2, y + 5, { align: 'center' })
  y += 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const legal =
    'In accordance with section 1 of Presidential Decree No. 522 and 856. The permit is subject to revocation if owner, operator or manager fails to observe the rules and regulations in a manner satisfactory to the Municipal Sanitation Committee or its duly authorized representative.'
  const legalLines = doc.splitTextToSize(legal, pageW - 40)
  doc.text(legalLines, 20, y)
  y += legalLines.length * 4.5 + 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Municipal Sanitation Committee:', 20, y)
  y += 14

  drawSignatureBlock(doc, 20, y, SI_NAME, SI_TITLE)
  drawSignatureBlock(doc, 20, y + 28, MHO_NAME, MHO_TITLE)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const rightX = pageW - 95
  doc.text(`Permit No.: ${str(payload.referenceNumber, '____________')}`, rightX, y)
  doc.text(`Date of Issuance: ${formatDate(payload.issuedAt)}`, rightX, y + 8)
  doc.text(
    `Date of Expiration: ${formatDate(d.expiration_date || d.date_of_expiration)}`,
    rightX,
    y + 16,
  )

  y += 58
  drawSignatureBlock(doc, pageW - 85, y, MAYOR_NAME, MAYOR_TITLE)

  y += 24
  doc.setTextColor(200, 90, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('THIS MUST BE DISPLAYED IN PUBLIC VIEW', pageW / 2, y, { align: 'center' })
  doc.setTextColor(0)

  drawFooterNote(doc, 'Generated by HealthTrack RHU Pila · Sanitary Permit')
}

/** Certificate of Exhumation */
function drawExhumationCertificate(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  const d = payload.details || {}
  let y = drawRhuHeader(doc)
  drawCentered(doc, 'CERTIFICATE OF EXHUMATION', y, 14, 'bold')
  doc.setDrawColor(30)
  doc.line(55, y + 2, pageW - 55, y + 2)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TO WHOM IT MAY CONCERN:', 20, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const p1 = `PERMISSION is hereby granted to disinterment / exhumation of the bodies or remains of the late ${str(d.deceased_name)} who died on ${formatDate(d.date_of_death)} due to ${str(d.cause_of_death || d.place_of_death || '________________')}.`
  const p1Lines = doc.splitTextToSize(p1, pageW - 40)
  doc.text(p1Lines, 20, y)
  y += p1Lines.length * 5.2 + 8

  const dest = str(d.cemetery_or_destination || d.destination)
  const p2 = `Further, they are allowed to transfer the remains of ${str(d.deceased_name)} to ${dest} to an appropriate place in accordance with the Sanitation Rules and Regulation.`
  const p2Lines = doc.splitTextToSize(p2, pageW - 40)
  doc.text(p2Lines, 20, y)
  y += p2Lines.length * 5.2 + 20

  drawSignatureBlock(doc, pageW - 85, y, MHO_NAME, MHO_TITLE)
  y += 28
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('By:', pageW - 85, y)
  drawSignatureBlock(doc, pageW - 85, y + 10, SI_NAME, 'Sanitation Inspector – 1')

  y = 230
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Attached Death Certificate', 20, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`O.R. No. ${str(d.or_number || d.or_no, '____________')}`, 20, y + 8)
  doc.text(`Date: ${formatDate(d.or_date || payload.issuedAt)}`, 20, y + 16)
  doc.text(`Requester: ${str(d.requester_name)} (${str(d.requester_relationship, '—')})`, 20, y + 24)

  drawFooterNote(doc, 'Generated by HealthTrack RHU Pila · Certificate of Exhumation')
}

/** Certificate of Transfer of Cadaver/Bones and Ashes */
function drawTransferCertificate(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  const d = payload.details || {}
  let y = drawRhuHeader(doc)
  drawCentered(doc, 'CERTIFICATE OF TRANSFER OF', y, 13, 'bold')
  drawCentered(doc, 'CADAVER/BONES AND ASHES', y + 6, 13, 'bold')
  y += 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('To Whom It May Concern:', 20, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const p1 = `Permission is hereby granted to transfer the remain of the late ${str(d.deceased_name)} who died of ${str(d.cause_of_death || d.place_of_death)} at the age of ${str(d.deceased_age || d.age)} from Pila, Laguna to ${str(d.cemetery_or_destination || d.destination)}.`
  const p1Lines = doc.splitTextToSize(p1, pageW - 40)
  doc.text(p1Lines, 20, y)
  y += p1Lines.length * 5.2 + 8

  const p2 =
    'It appearing that: A Certificate of Death is filed by Section 1090 of the Revised Administrative Code of the Philippines.'
  const p2Lines = doc.splitTextToSize(p2, pageW - 40)
  doc.text(p2Lines, 20, y)
  y += p2Lines.length * 5.2 + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const cond =
    'THE CAUSE OF DEATH IS NON COMMUNICABLE DISEASES (Not Valid unless corresponding fee is paid)'
  const condLines = doc.splitTextToSize(cond, pageW - 40)
  doc.text(condLines, 20, y)
  y += condLines.length * 5.2 + 20

  drawSignatureBlock(doc, pageW - 85, y, MHO_NAME, MHO_TITLE)
  y += 28
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('By:', pageW - 85, y)
  drawSignatureBlock(doc, pageW - 85, y + 10, SI_NAME, 'Sanitation Inspector 1')

  y = 230
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Attached Death Certificate', 20, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`O.R. No. ${str(d.or_number || d.or_no, '____________')}`, 20, y + 8)
  doc.text(`Date: ${formatDate(d.or_date || payload.issuedAt)}`, 20, y + 16)

  drawFooterNote(doc, 'Generated by HealthTrack RHU Pila · Certificate of Transfer of Cadaver/Bones and Ashes')
}

/** Cremation Permit — same office letter style */
function drawCremationPermit(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  const d = payload.details || {}
  let y = drawRhuHeader(doc)
  drawCentered(doc, 'CREMATION PERMIT', y, 14, 'bold')
  doc.line(70, y + 2, pageW - 70, y + 2)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TO WHOM IT MAY CONCERN:', 20, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const body = `PERMISSION is hereby granted for the cremation of the remains of the late ${str(d.deceased_name)} who died on ${formatDate(d.date_of_death)} at ${str(d.place_of_death)}. Cremation / disposition shall be at ${str(d.cemetery_or_destination || d.crematory || '________________')} in accordance with sanitation rules and regulations.`
  const lines = doc.splitTextToSize(body, pageW - 40)
  doc.text(lines, 20, y)
  y += lines.length * 5.2 + 20

  drawSignatureBlock(doc, pageW - 85, y, MHO_NAME, MHO_TITLE)
  y += 28
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('By:', pageW - 85, y)
  drawSignatureBlock(doc, pageW - 85, y + 10, SI_NAME, 'Sanitation Inspector – 1')

  y = 230
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Attached Death Certificate', 20, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`O.R. No. ${str(d.or_number || d.or_no, '____________')}`, 20, y + 8)
  doc.text(`Date: ${formatDate(d.or_date || payload.issuedAt)}`, 20, y + 16)
  doc.text(`Requester: ${str(d.requester_name)}`, 20, y + 24)

  drawFooterNote(doc, 'Generated by HealthTrack RHU Pila · Cremation Permit')
}

/** Certificate of Death — review / working copy of Municipal Form No. 103 key fields */
function drawDeathCertificateReview(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  const d = payload.details || {}
  const pd = payload.patientDetails || {}

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  drawCentered(doc, 'Republic of the Philippines', 14, 9, 'bold')
  drawCentered(doc, 'OFFICE OF THE CIVIL REGISTRAR GENERAL', 19, 9, 'bold')
  drawCentered(doc, 'CERTIFICATE OF DEATH', 28, 14, 'bold')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  drawCentered(doc, '(Municipal Form No. 103 · Review Copy — RHU Pila)', 34, 8, 'normal')

  doc.setDrawColor(30)
  doc.setLineWidth(0.5)
  doc.rect(14, 40, pageW - 28, 230)

  let y = 48
  doc.setFontSize(8)
  doc.text(`Province: Laguna`, 18, y)
  doc.text(`City/Municipality: Pila`, 80, y)
  doc.text(`Registry No.: ${str(payload.referenceNumber, '________')}`, 140, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('1. NAME OF DECEASED', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(str(d.deceased_name || payload.patientName), 18, y + 5)
  doc.line(18, y + 6.5, pageW - 18, y + 6.5)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('2. SEX', 18, y)
  doc.text('3. DATE OF DEATH', 70, y)
  doc.text('4. PLACE OF DEATH', 130, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(str(d.deceased_sex || pd.sex, '________'), 18, y + 5)
  doc.text(formatDate(d.date_of_death), 70, y + 5)
  doc.text(str(d.place_of_death, '________'), 130, y + 5)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('10. RESIDENCE / NOTES', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const residence = str(
    d.requester_address ||
      [pd.house_no_purok, pd.barangay, pd.municipality || 'Pila', pd.province || 'Laguna']
        .filter(Boolean)
        .join(', '),
    '',
  )
  doc.text(doc.splitTextToSize(residence || '________________', pageW - 40), 18, y + 5)
  y += 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('19b. CAUSES OF DEATH / REVIEW NOTES', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const cause = str(d.cause_of_death || d.purpose || d.review_reason || payload.purpose || payload.notes, '')
  const causeLines = doc.splitTextToSize(cause || '________________', pageW - 40)
  doc.text(causeLines, 18, y + 5)
  y += Math.max(18, causeLines.length * 4.5 + 10)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('23. CORPSE DISPOSAL (if applicable)', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(str(d.corpse_disposal || d.disposal_type, 'Burial / Cremation / Others: ________'), 18, y + 5)
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('24a/24b. BURIAL/CREMATION/TRANSFER PERMIT', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(
    `No.: ${str(d.permit_number || payload.referenceNumber, '________')}   Date: ${formatDate(d.permit_date || payload.issuedAt)}`,
    18,
    y + 5,
  )
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('25. CEMETERY / CREMATORY / DESTINATION', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(str(d.cemetery_or_destination || d.cemetery, '________________'), 18, y + 5)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('26. INFORMANT / REQUESTER', 18, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(
    `${str(d.requester_name)} · ${str(d.requester_relationship, '—')} · ${str(d.requester_contact, '')}`,
    18,
    y + 5,
  )
  y += 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('22. CERTIFICATION / REVIEWED BY', 18, y)
  y += 18
  drawSignatureBlock(doc, pageW - 85, y, MHO_NAME, MHO_TITLE)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Date reviewed: ${formatDate(payload.issuedAt)}`, 18, y + 5)
  doc.text(`Review reason: ${str(d.review_reason, '—')}`, 18, y + 12)

  drawFooterNote(
    doc,
    'RHU Pila review working copy · Not a substitute for PSA/LCRO registered Certificate of Death unless officially registered',
  )
}

/** Generic fallback (medical / pre-marriage / unknown) */
function drawGenericCertificate(doc, payload) {
  const pageW = doc.internal.pageSize.getWidth()
  let y = drawRhuHeader(doc, { officeLine: 'RURAL HEALTH UNIT OF PILA', y: 16 })
  drawCentered(doc, String(payload.title || 'Issued Document').toUpperCase(), y, 15, 'bold')
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('This is to certify that:', 20, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(str(payload.patientName, '—'), 20, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const pd = payload.patientDetails || {}
  if (pd.age != null && pd.age !== '') {
    doc.text(`Age: ${pd.age}`, 20, y)
    y += 6
  }
  if (pd.sex) {
    doc.text(`Sex: ${pd.sex}`, 20, y)
    y += 6
  }
  if (payload.purpose) {
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.text('Purpose', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(String(payload.purpose), pageW - 40)
    doc.text(lines, 20, y)
    y += lines.length * 5 + 4
  }
  if (payload.notes) {
    doc.setFont('helvetica', 'bold')
    doc.text('Remarks', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(String(payload.notes), pageW - 40)
    doc.text(lines, 20, y)
    y += lines.length * 5 + 4
  }

  y = Math.max(y + 10, 220)
  doc.text(`Date issued: ${formatDate(payload.issuedAt)}`, 20, y)
  if (payload.referenceNumber) {
    y += 6
    doc.text(`Reference: ${payload.referenceNumber}`, 20, y)
  }
  drawSignatureBlock(doc, pageW - 85, 240, MHO_NAME, MHO_TITLE)
  drawFooterNote(doc, 'Generated by HealthTrack RHU Pila')
}

function resolveTemplateKey(payload = {}) {
  const details = payload.details || {}
  const explicit = (payload.template || payload.docType || '').toString().toLowerCase()
  if (explicit) return explicit

  const cert = (payload.cert_type || '').toString()
  const permit = (payload.permit_type || '').toString()
  const title = (payload.title || '').toString().toLowerCase()

  if (cert === 'health_card' || /health\s*cert|health\s*card/.test(title)) {
    return isFoodHandler(details) === false ? 'health_certificate_nonfood' : 'health_certificate_food'
  }
  if (cert === 'death_cert_review' || /death\s*cert/.test(title)) return 'death_certificate'
  if (permit === 'sanitary' || /sanitary/.test(title)) return 'sanitary_permit'
  if (permit === 'exhumation' || /exhumation/.test(title)) return 'exhumation'
  if (permit === 'transfer' || /transfer/.test(title)) return 'transfer'
  if (permit === 'cremation' || /cremation/.test(title)) return 'cremation'
  return 'generic'
}

/**
 * Build and download an RHU Pila official form PDF for Other Services.
 * @returns {{ filename: string }}
 */
export function downloadIssuedDocumentPdf(payload = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const key = resolveTemplateKey(payload)

  if (key === 'health_certificate_food' || key === 'health_certificate_nonfood') {
    // Force category via details for nonfood key
    if (key === 'health_certificate_nonfood') {
      payload = {
        ...payload,
        details: { ...(payload.details || {}), handler_type: 'Non-food handler' },
      }
    } else if (!(payload.details || {}).handler_type) {
      payload = {
        ...payload,
        details: { ...(payload.details || {}), handler_type: 'Food handler' },
      }
    }
    drawHealthCertificate(doc, payload)
  } else if (key === 'sanitary_permit') {
    drawSanitaryPermit(doc, payload)
  } else if (key === 'exhumation') {
    drawExhumationCertificate(doc, payload)
  } else if (key === 'transfer') {
    drawTransferCertificate(doc, payload)
  } else if (key === 'cremation') {
    drawCremationPermit(doc, payload)
  } else if (key === 'death_certificate') {
    drawDeathCertificateReview(doc, payload)
  } else {
    drawGenericCertificate(doc, payload)
  }

  const dateTag = payload.issuedAt
    ? new Date(payload.issuedAt).toISOString().slice(0, 10).replace(/-/g, '')
    : 'undated'
  const filename = `${safeFilePart(payload.title || key)}-${dateTag}.pdf`
  doc.save(filename)
  return { filename }
}

export function documentTitleFromRow(row) {
  if (!row) return 'Issued Document'
  if (row.cert_type === 'medical') return 'Medical Certificate'
  if (row.cert_type === 'health_card') {
    const d = row.details && typeof row.details === 'object' ? row.details : {}
    const food = isFoodHandler(d)
    if (food === false) return 'Health Certificate (Non-Food)'
    if (food === true) return 'Health Certificate (Food)'
    return 'Health Certificate'
  }
  if (row.cert_type === 'death_cert_review') return 'Certificate of Death (Review)'
  if (row.cert_type === 'pre_marriage') return 'Pre-marriage Counseling Certificate'
  if (row.permit_type === 'sanitary') return 'Sanitary Permit'
  if (row.permit_type === 'exhumation') return 'Certificate of Exhumation'
  if (row.permit_type === 'cremation') return 'Cremation Permit'
  if (row.permit_type === 'transfer') return 'Certificate of Transfer of Cadaver/Bones and Ashes'
  return 'Issued Document'
}

export function pdfPayloadFromCertificate(row, patientName) {
  const details = row?.details && typeof row.details === 'object' ? row.details : {}
  return {
    title: documentTitleFromRow(row),
    cert_type: row?.cert_type,
    patientName: details.applicant_name || details.deceased_name || patientName || 'Patient',
    purpose: row?.purpose,
    notes: details.notes || details.additional_notes || null,
    details,
    issuedAt: row?.released_at || row?.issued_at || row?.created_at,
    referenceNumber: row?.service_request_id
      ? String(row.service_request_id).slice(0, 8).toUpperCase()
      : null,
  }
}

export function pdfPayloadFromPermit(row, patientName) {
  const details = row?.details && typeof row.details === 'object' ? row.details : {}
  return {
    title: documentTitleFromRow(row),
    permit_type: row?.permit_type,
    patientName: row?.applicant_name || details.deceased_name || patientName || 'Applicant',
    purpose: details.outcome || documentTitleFromRow(row),
    notes: details.notes || details.additional_notes || null,
    details,
    issuedAt: row?.released_at || row?.approved_at || row?.created_at,
    referenceNumber: row?.service_request_id
      ? String(row.service_request_id).slice(0, 8).toUpperCase()
      : null,
  }
}
