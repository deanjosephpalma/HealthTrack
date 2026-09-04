import { supabase } from './supabaseClient'

/** Map nurse desk kind → certificate or permit payload. */
export function resolveIssuedDocumentSpec({ serviceKind, serviceName, intakeData = {} } = {}) {
  const name = (serviceName ?? '').toString()
  const intakeType = (intakeData.permit_type || intakeData.type || intakeData.transfer_type || '')
    .toString()
    .toLowerCase()

  if (serviceKind === 'health_card') {
    const handler = (intakeData.handler_type || '').toString().toLowerCase()
    const isNonFood = /non[-\s]?food/.test(handler)
    return {
      table: 'certificates',
      cert_type: 'health_card',
      title: isNonFood ? 'Health Certificate (Non-Food)' : 'Health Certificate (Food)',
      purpose: isNonFood
        ? 'Issuance of Health Certificate — Non-Food Establishment'
        : 'Issuance of Health Certificate — Food Establishment',
    }
  }
  if (serviceKind === 'death_certificate') {
    return {
      table: 'certificates',
      cert_type: 'death_cert_review',
      title: 'Certificate of Death (Review)',
      purpose: 'Review of Death Certificate',
    }
  }
  if (serviceKind === 'pre_marriage') {
    return {
      table: 'certificates',
      cert_type: 'pre_marriage',
      title: 'Pre-marriage Counseling Certificate',
      purpose: 'Pre-marriage Counseling',
    }
  }
  if (serviceKind === 'sanitary_permit') {
    return {
      table: 'permits',
      permit_type: 'sanitary',
      title: 'Sanitary Permit',
      purpose: 'Issuance of Sanitary Permit',
    }
  }
  if (serviceKind === 'exhumation_permit') {
    let permit_type = 'exhumation'
    if (/cremation/i.test(intakeType) || /cremation/i.test(name)) permit_type = 'cremation'
    else if (/transfer/i.test(intakeType) || /transfer/i.test(name)) permit_type = 'transfer'
    else if (/exhumation/i.test(intakeType) || /exhumation/i.test(name)) permit_type = 'exhumation'
    const title =
      permit_type === 'cremation'
        ? 'Cremation Permit'
        : permit_type === 'transfer'
          ? 'Certificate of Transfer of Cadaver/Bones and Ashes'
          : 'Certificate of Exhumation'
    return {
      table: 'permits',
      permit_type,
      title,
      purpose: title,
    }
  }
  if (serviceKind === 'medcert') {
    return {
      table: 'certificates',
      cert_type: 'medical',
      title: 'Medical Certificate',
      purpose: 'Issuance of Medical Certificate',
    }
  }
  return null
}

function medcertPurposeText(formData = {}) {
  const parts = []
  if (formData.medcert_pwd) parts.push('PWD')
  if (formData.medcert_work) parts.push('Work')
  if (formData.medcert_financial) parts.push('Financial')
  if (formData.medcert_4ps) parts.push('4Ps')
  if (formData.medcert_school) parts.push('School')
  if (formData.medcert_others) parts.push(String(formData.medcert_others))
  return parts.length ? parts.join(', ') : 'Medical Certificate'
}

/**
 * Insert a released certificate or permit row (online). Non-fatal if offline/fails.
 */
export async function releaseIssuedDocument({
  serviceKind,
  serviceName,
  patientId,
  serviceRequestId,
  issuedBy,
  outcome,
  notes,
  intakeData = {},
  formData = {},
  applicantName,
}) {
  if (!patientId) return { ok: false, error: 'patient_id required' }

  const spec = resolveIssuedDocumentSpec({ serviceKind, serviceName, intakeData })
  if (!spec) return { ok: false, error: 'unsupported_service_kind' }

  const nowIso = new Date().toISOString()
  const purpose =
    serviceKind === 'medcert'
      ? medcertPurposeText(formData)
      : outcome || spec.purpose

  try {
    if (spec.table === 'certificates') {
      const details = {
        ...(intakeData && typeof intakeData === 'object' ? intakeData : {}),
        outcome: outcome || null,
        notes: notes || null,
        service_name: serviceName || null,
      }
      const row = {
        patient_id: patientId,
        service_request_id: serviceRequestId || null,
        cert_type: spec.cert_type,
        purpose: purpose || null,
        details,
        issued_by: issuedBy || null,
        approved_by: issuedBy || null,
        issued_at: nowIso,
        released_at: nowIso,
        status: 'released',
      }

      const insertWithoutDetails = async () => {
        const { details: _drop, ...legacy } = row
        if (serviceRequestId) {
          const { data: existing } = await supabase
            .from('certificates')
            .select('id')
            .eq('service_request_id', serviceRequestId)
            .eq('cert_type', spec.cert_type)
            .maybeSingle()
          if (existing?.id) {
            const { data, error } = await supabase
              .from('certificates')
              .update(legacy)
              .eq('id', existing.id)
              .select('*')
              .maybeSingle()
            if (error) return { ok: false, error: error.message }
            return { ok: true, table: 'certificates', row: { ...data, details }, title: spec.title }
          }
        }
        const { data, error } = await supabase.from('certificates').insert(legacy).select('*').maybeSingle()
        if (error) return { ok: false, error: error.message }
        return { ok: true, table: 'certificates', row: { ...data, details }, title: spec.title }
      }

      if (serviceRequestId) {
        const { data: existing } = await supabase
          .from('certificates')
          .select('id')
          .eq('service_request_id', serviceRequestId)
          .eq('cert_type', spec.cert_type)
          .maybeSingle()
        if (existing?.id) {
          const { data, error } = await supabase
            .from('certificates')
            .update(row)
            .eq('id', existing.id)
            .select('*')
            .maybeSingle()
          if (error && /details/i.test(error.message || '')) return insertWithoutDetails()
          if (error) return { ok: false, error: error.message }
          return { ok: true, table: 'certificates', row: data, title: spec.title }
        }
      }
      const { data, error } = await supabase.from('certificates').insert(row).select('*').maybeSingle()
      if (error && /details/i.test(error.message || '')) return insertWithoutDetails()
      if (error) return { ok: false, error: error.message }
      return { ok: true, table: 'certificates', row: data, title: spec.title }
    }

    const details = {
      ...(intakeData && typeof intakeData === 'object' ? intakeData : {}),
      outcome: outcome || null,
      notes: notes || null,
      service_name: serviceName || null,
    }
    const row = {
      patient_id: patientId,
      service_request_id: serviceRequestId || null,
      permit_type: spec.permit_type,
      applicant_name: applicantName || null,
      details,
      issued_by: issuedBy || null,
      approved_by: issuedBy || null,
      approved_at: nowIso,
      released_at: nowIso,
      status: 'released',
    }
    if (serviceRequestId) {
      const { data: existing } = await supabase
        .from('permits')
        .select('id')
        .eq('service_request_id', serviceRequestId)
        .eq('permit_type', spec.permit_type)
        .maybeSingle()
      if (existing?.id) {
        const { data, error } = await supabase
          .from('permits')
          .update(row)
          .eq('id', existing.id)
          .select('*')
          .maybeSingle()
        if (error) return { ok: false, error: error.message }
        return { ok: true, table: 'permits', row: data, title: spec.title }
      }
    }
    const { data, error } = await supabase.from('permits').insert(row).select('*').maybeSingle()
    if (error) return { ok: false, error: error.message }
    return { ok: true, table: 'permits', row: data, title: spec.title }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export function documentTitleFromRow(doc) {
  if (!doc) return 'Issued Document'
  if (doc.cert_type === 'medical') return 'Medical Certificate'
  if (doc.cert_type === 'health_card') {
    const details = doc.details && typeof doc.details === 'object' ? doc.details : {}
    const handler = (details.handler_type || '').toString().toLowerCase()
    if (/non[-\s]?food/.test(handler)) return 'Health Certificate (Non-Food)'
    if (/food/.test(handler)) return 'Health Certificate (Food)'
    return 'Health Certificate'
  }
  if (doc.cert_type === 'death_cert_review') return 'Certificate of Death (Review)'
  if (doc.cert_type === 'pre_marriage') return 'Pre-marriage Counseling Certificate'
  if (doc.permit_type === 'sanitary') return 'Sanitary Permit'
  if (doc.permit_type === 'exhumation') return 'Certificate of Exhumation'
  if (doc.permit_type === 'cremation') return 'Cremation Permit'
  if (doc.permit_type === 'transfer') return 'Certificate of Transfer of Cadaver/Bones and Ashes'
  return 'Issued Document'
}

export async function fetchIssuedDocsForPatient(patientId) {
  if (!patientId) return { certificates: [], permits: [] }
  const [cRes, pRes] = await Promise.all([
    supabase
      .from('certificates')
      .select('*')
      .eq('patient_id', patientId)
      .eq('status', 'released')
      .order('released_at', { ascending: false }),
    supabase
      .from('permits')
      .select('*')
      .eq('patient_id', patientId)
      .eq('status', 'released')
      .order('released_at', { ascending: false }),
  ])
  return {
    certificates: cRes.data ?? [],
    permits: pRes.data ?? [],
    error: cRes.error?.message || pRes.error?.message || null,
  }
}

export async function fetchIssuedDocForServiceRequest(serviceRequestId) {
  if (!serviceRequestId) return null
  const { data: cert } = await supabase
    .from('certificates')
    .select('*')
    .eq('service_request_id', serviceRequestId)
    .eq('status', 'released')
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cert) return { kind: 'certificate', row: cert }
  const { data: permit } = await supabase
    .from('permits')
    .select('*')
    .eq('service_request_id', serviceRequestId)
    .eq('status', 'released')
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (permit) return { kind: 'permit', row: permit }
  return null
}
