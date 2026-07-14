import { apiFetch } from './apiClient'

/**
 * Staff AI helpers — keys live on Laravel only (GEMINI_API_KEY).
 * Never use VITE_GEMINI_API_KEY in the browser.
 */

async function callAi(mode, payload) {
  try {
    const result = await apiFetch('/ai/generate', {
      method: 'POST',
      body: { mode, payload },
    })
    return result
  } catch (err) {
    console.error('AI proxy error:', err)
    return { ok: false, text: err?.message || 'Failed to reach AI service.', insights: [] }
  }
}

export async function generateClinicalSummary(patientInfo, medicalRecords) {
  const result = await callAi('clinical_summary', { patientInfo, medicalRecords })
  return result?.text || 'Failed to generate summary. Please try again later.'
}

export async function generateSmartDiagnosis(symptoms, vitals) {
  const result = await callAi('smart_diagnosis', { symptoms, vitals })
  return result?.text || 'Failed to generate diagnostic suggestions.'
}

export async function generateHealthPlanReport(stats) {
  const result = await callAi('health_plan', { stats })
  return result?.text || 'Failed to generate health plan report.'
}

export async function generateCommandCenterInsights(gisData) {
  const result = await callAi('gis_insights', { gisData })
  if (Array.isArray(result?.insights)) return result.insights
  return ['AI analysis temporarily unavailable.']
}
