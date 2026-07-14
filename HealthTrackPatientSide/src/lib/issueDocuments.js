import { supabase } from './supabaseClient'
import { documentTitleFromRow } from './issuedDocumentPdf'

export { documentTitleFromRow }

function resolveSpecFromServiceName(serviceName = '') {
  const n = (serviceName ?? '').toString()
  if (/medical\s*cert|med\s*cert|medico-?legal/i.test(n)) {
    return { table: 'certificates', cert_type: 'medical', title: 'Medical Certificate', purpose: n || 'Medical Certificate' }
  }
  if (/health\s*card/i.test(n)) {
    return { table: 'certificates', cert_type: 'health_card', title: 'Health Card', purpose: n || 'Health Card' }
  }
  if (/death\s*cert/i.test(n)) {
    return {
      table: 'certificates',
      cert_type: 'death_cert_review',
      title: 'Death Certificate Review',
      purpose: n || 'Death Certificate Review',
    }
  }
  if (/pre-?\s*marriage|premarriage/i.test(n)) {
    return {
      table: 'certificates',
      cert_type: 'pre_marriage',
      title: 'Pre-marriage Counseling Certificate',
      purpose: n || 'Pre-marriage Counseling',
    }
  }
  if (/sanitary/i.test(n)) {
    return { table: 'permits', permit_type: 'sanitary', title: 'Sanitary Permit', purpose: n || 'Sanitary Permit' }
  }
  if (/cremation/i.test(n)) {
    return { table: 'permits', permit_type: 'cremation', title: 'Cremation Permit', purpose: n || 'Cremation Permit' }
  }
  if (/transfer/i.test(n) && /permit|exhumation|cremation|remains/i.test(n)) {
    return { table: 'permits', permit_type: 'transfer', title: 'Transfer Permit', purpose: n || 'Transfer Permit' }
  }
  if (/exhumation/i.test(n)) {
    return { table: 'permits', permit_type: 'exhumation', title: 'Exhumation Permit', purpose: n || 'Exhumation Permit' }
  }
  return null
}

/**
 * Create missing certificates/permits from the patient's Completed service requests.
 * Fixes docs that were completed before the issued-document feature shipped.
 */
export async function backfillIssuedDocumentsForPatient(patientId, patientAuthId = null) {
  if (!patientId && !patientAuthId) return { created: 0, error: null }

  let query = supabase
    .from('service_requests')
    .select('id, status, patient_id, patient_auth_id, updated_at, created_at, service_types ( id, name, queue_prefix )')
    .in('status', ['Completed', 'completed', 'Done', 'done'])
    .order('updated_at', { ascending: false })
    .limit(40)

  if (patientId) query = query.eq('patient_id', patientId)
  else query = query.eq('patient_auth_id', patientAuthId)

  const { data: rows, error } = await query
  if (error) return { created: 0, error: error.message }

  let created = 0
  const resolvedPatientId = patientId || rows?.[0]?.patient_id || null
  if (!resolvedPatientId) return { created: 0, error: null }

  for (const sr of rows ?? []) {
    const serviceName = sr.service_types?.name || ''
    const spec = resolveSpecFromServiceName(serviceName)
    if (!spec) continue

    const nowIso = sr.updated_at || sr.created_at || new Date().toISOString()

    if (spec.table === 'certificates') {
      const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('service_request_id', sr.id)
        .eq('cert_type', spec.cert_type)
        .maybeSingle()
      if (existing?.id) continue

      const { error: insErr } = await supabase.from('certificates').insert({
        patient_id: resolvedPatientId,
        service_request_id: sr.id,
        cert_type: spec.cert_type,
        purpose: spec.purpose,
        issued_at: nowIso,
        released_at: nowIso,
        status: 'released',
      })
      if (!insErr) created += 1
      continue
    }

    const { data: existing } = await supabase
      .from('permits')
      .select('id')
      .eq('service_request_id', sr.id)
      .eq('permit_type', spec.permit_type)
      .maybeSingle()
    if (existing?.id) continue

    const { error: insErr } = await supabase.from('permits').insert({
      patient_id: resolvedPatientId,
      service_request_id: sr.id,
      permit_type: spec.permit_type,
      applicant_name: null,
      details: { outcome: `${spec.title} released`, service_name: serviceName },
      approved_at: nowIso,
      released_at: nowIso,
      status: 'released',
    })
    if (!insErr) created += 1
  }

  return { created, error: null }
}

async function buildSyntheticIssuedDocs(patientId, patientAuthId) {
  const certificates = []
  const permits = []
  const seen = new Set()

  let query = supabase
    .from('service_requests')
    .select('id, status, patient_id, updated_at, created_at, service_types ( name )')
    .in('status', ['Completed', 'completed', 'Done', 'done'])
    .limit(40)
  if (patientId) query = query.eq('patient_id', patientId)
  else if (patientAuthId) query = query.eq('patient_auth_id', patientAuthId)

  const { data: rows } = await query
  for (const sr of rows ?? []) {
    const spec = resolveSpecFromServiceName(sr.service_types?.name || '')
    if (!spec) continue
    const key = `${spec.table}:${spec.cert_type || spec.permit_type}:${sr.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const nowIso = sr.updated_at || sr.created_at
    if (spec.table === 'certificates') {
      certificates.push({
        id: `synthetic-cert-${sr.id}`,
        service_request_id: sr.id,
        patient_id: patientId,
        cert_type: spec.cert_type,
        purpose: spec.purpose,
        issued_at: nowIso,
        released_at: nowIso,
        status: 'released',
        _synthetic: true,
      })
    } else {
      permits.push({
        id: `synthetic-permit-${sr.id}`,
        service_request_id: sr.id,
        patient_id: patientId,
        permit_type: spec.permit_type,
        details: { outcome: `${spec.title} released`, service_name: sr.service_types?.name },
        released_at: nowIso,
        approved_at: nowIso,
        status: 'released',
        _synthetic: true,
      })
    }
  }

  // Also recover from completed patient_records (nurse desk outcomes) when SR link is missing
  if (patientId || patientAuthId) {
    let recQuery = supabase
      .from('patient_records')
      .select('id, diagnosis, notes, date_of_consultation, created_at, nurse_completed_at, patient_id')
      .eq('workflow_status', 'completed')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(40)
    if (patientId) recQuery = recQuery.eq('patient_id', patientId)
    else recQuery = recQuery.eq('patient_auth_id', patientAuthId)

    const { data: records } = await recQuery
    for (const rec of records ?? []) {
      const label = `${rec.diagnosis || ''} ${rec.notes || ''}`
      const spec = resolveSpecFromServiceName(label)
      if (!spec) continue
      const key = `${spec.table}:${spec.cert_type || spec.permit_type}:record-${rec.id}`
      if (seen.has(key)) continue
      // Skip if we already have same type from a service request
      const alreadyType = [...seen].some((k) => k.startsWith(`${spec.table}:${spec.cert_type || spec.permit_type}:`))
      if (alreadyType && (certificates.length || permits.length)) {
        // still allow multiple health cards etc. — only skip exact record key
      }
      seen.add(key)
      const nowIso = rec.nurse_completed_at || rec.date_of_consultation || rec.created_at
      if (spec.table === 'certificates') {
        certificates.push({
          id: `synthetic-cert-record-${rec.id}`,
          service_request_id: null,
          patient_id: patientId || rec.patient_id,
          cert_type: spec.cert_type,
          purpose: rec.diagnosis || spec.purpose,
          issued_at: nowIso,
          released_at: nowIso,
          status: 'released',
          _synthetic: true,
        })
      } else {
        permits.push({
          id: `synthetic-permit-record-${rec.id}`,
          service_request_id: null,
          patient_id: patientId || rec.patient_id,
          permit_type: spec.permit_type,
          details: { outcome: rec.diagnosis || `${spec.title} released`, notes: rec.notes || null },
          released_at: nowIso,
          approved_at: nowIso,
          status: 'released',
          _synthetic: true,
        })
      }
    }
  }

  // Queue tickets (HC/DC/etc.) completed at the desk even without a typed SR name
  if (patientId) {
    const { data: queueRows } = await supabase
      .from('queue')
      .select('id, service_code, status, updated_at, created_at, patient_name, reason')
      .eq('patient_id', patientId)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(40)

    for (const q of queueRows ?? []) {
      const code = (q.service_code || '').toUpperCase()
      let spec = null
      if (code === 'HC' || code === 'IHC') {
        spec = { table: 'certificates', cert_type: 'health_card', title: 'Health Card', purpose: q.reason || 'Health Card' }
      } else if (code === 'DC' || code === 'RDC') {
        spec = {
          table: 'certificates',
          cert_type: 'death_cert_review',
          title: 'Death Certificate Review',
          purpose: q.reason || 'Death Certificate Review',
        }
      } else if (code === 'MC' || code === 'IMC') {
        spec = { table: 'certificates', cert_type: 'medical', title: 'Medical Certificate', purpose: q.reason || 'Medical Certificate' }
      } else if (code === 'SP' || code === 'ISP') {
        spec = { table: 'permits', permit_type: 'sanitary', title: 'Sanitary Permit', purpose: q.reason || 'Sanitary Permit' }
      } else if (code === 'EC' || code === 'ECT') {
        spec = { table: 'permits', permit_type: 'exhumation', title: 'Exhumation Permit', purpose: q.reason || 'Exhumation Permit' }
      } else if (code === 'PM' || code === 'PMC') {
        spec = {
          table: 'certificates',
          cert_type: 'pre_marriage',
          title: 'Pre-marriage Counseling Certificate',
          purpose: q.reason || 'Pre-marriage Counseling',
        }
      } else {
        spec = resolveSpecFromServiceName(q.reason || '')
      }
      if (!spec) continue
      const key = `${spec.table}:${spec.cert_type || spec.permit_type}:queue-${q.id}`
      if (seen.has(key)) continue
      seen.add(key)
      const nowIso = q.updated_at || q.created_at
      if (spec.table === 'certificates') {
        certificates.push({
          id: `synthetic-cert-queue-${q.id}`,
          service_request_id: null,
          patient_id: patientId,
          cert_type: spec.cert_type,
          purpose: spec.purpose,
          issued_at: nowIso,
          released_at: nowIso,
          status: 'released',
          _synthetic: true,
        })
      } else {
        permits.push({
          id: `synthetic-permit-queue-${q.id}`,
          service_request_id: null,
          patient_id: patientId,
          permit_type: spec.permit_type,
          applicant_name: q.patient_name || null,
          details: { outcome: `${spec.title} released`, service_name: q.reason },
          released_at: nowIso,
          approved_at: nowIso,
          status: 'released',
          _synthetic: true,
        })
      }
    }
  }

  return { certificates, permits }
}

export async function fetchIssuedDocsForPatient(patientId, { patientAuthId = null, backfill = true } = {}) {
  if (!patientId && !patientAuthId) return { certificates: [], permits: [] }

  if (backfill) {
    try {
      await backfillIssuedDocumentsForPatient(patientId, patientAuthId)
    } catch {
      /* non-fatal */
    }
  }

  if (!patientId) {
    const synthetic = await buildSyntheticIssuedDocs(null, patientAuthId)
    return { ...synthetic, error: null, synthetic: true }
  }

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

  if (cRes.error || pRes.error) {
    const synthetic = await buildSyntheticIssuedDocs(patientId, patientAuthId)
    return {
      certificates: synthetic.certificates,
      permits: synthetic.permits,
      error: cRes.error?.message || pRes.error?.message || null,
      synthetic: true,
    }
  }

  let certificates = cRes.data ?? []
  let permits = pRes.data ?? []

  if (certificates.length === 0 && permits.length === 0) {
    const synthetic = await buildSyntheticIssuedDocs(patientId, patientAuthId)
    if (synthetic.certificates.length || synthetic.permits.length) {
      return { ...synthetic, error: null, synthetic: true }
    }
  }

  return { certificates, permits, error: null }
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

  const { data: sr } = await supabase
    .from('service_requests')
    .select('id, status, patient_id, updated_at, created_at, service_types ( name )')
    .eq('id', serviceRequestId)
    .maybeSingle()
  if (!sr || !['completed', 'done'].includes((sr.status || '').toLowerCase())) return null
  const spec = resolveSpecFromServiceName(sr.service_types?.name || '')
  if (!spec) return null
  const nowIso = sr.updated_at || sr.created_at
  if (spec.table === 'certificates') {
    return {
      kind: 'certificate',
      row: {
        id: `synthetic-cert-${sr.id}`,
        service_request_id: sr.id,
        patient_id: sr.patient_id,
        cert_type: spec.cert_type,
        purpose: spec.purpose,
        issued_at: nowIso,
        released_at: nowIso,
        status: 'released',
        _synthetic: true,
      },
    }
  }
  return {
    kind: 'permit',
    row: {
      id: `synthetic-permit-${sr.id}`,
      service_request_id: sr.id,
      patient_id: sr.patient_id,
      permit_type: spec.permit_type,
      details: { outcome: `${spec.title} released`, service_name: sr.service_types?.name },
      released_at: nowIso,
      approved_at: nowIso,
      status: 'released',
      _synthetic: true,
    },
  }
}
