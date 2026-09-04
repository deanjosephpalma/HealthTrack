import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import LogoutConfirmModal from '../../components/LogoutConfirmModal'
import { isKnownPwdType, PWD_DISABILITY_TYPES } from '../../lib/pwdDisabilityTypes'

function splitPwdFields(disability) {
  const raw = String(disability || '').trim()
  if (!raw || ['none', 'n/a', 'na', 'no'].includes(raw.toLowerCase())) {
    return { pwd_status: 'No', pwd_specify: '', pwd_other_detail: '' }
  }
  if (isKnownPwdType(raw) && raw !== 'Other') {
    return { pwd_status: 'Yes', pwd_specify: raw, pwd_other_detail: '' }
  }
  if (/^other:\s*/i.test(raw)) {
    return { pwd_status: 'Yes', pwd_specify: 'Other', pwd_other_detail: raw.replace(/^other:\s*/i, '').trim() }
  }
  if (raw.toLowerCase() === 'other') {
    return { pwd_status: 'Yes', pwd_specify: 'Other', pwd_other_detail: '' }
  }
  return { pwd_status: 'Yes', pwd_specify: 'Other', pwd_other_detail: raw }
}

function composeDisability(pwdStatus, pwdSpecify, pwdOtherDetail) {
  if (pwdStatus !== 'Yes') return null
  if (!pwdSpecify) return null
  if (pwdSpecify === 'Other') {
    const detail = String(pwdOtherDetail || '').trim()
    return detail ? `Other: ${detail}` : null
  }
  return pwdSpecify
}

function splitFullName(name) {
  const parts = (name ?? '').toString().trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: '', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

function resolveProfileNames(data, user) {
  let firstName = (data?.first_name ?? '').toString().trim()
  let lastName = (data?.last_name ?? '').toString().trim()

  if (!firstName && !lastName && data?.name) {
    const split = splitFullName(data.name)
    firstName = split.first_name
    lastName = split.last_name
  }

  if (!firstName && !lastName && user?.user_metadata) {
    firstName = (user.user_metadata.first_name ?? '').toString().trim()
    lastName = (user.user_metadata.last_name ?? '').toString().trim()
  }

  return { firstName, lastName }
}

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    philhealth_number: '',
    birthdate: '',
    sex: '',
    mother_maiden_name: '',
    civil_status: '',
    religion: '',
    blood_type: '',
    mobile_phone: '',
    education: '',
    occupation: '',
    disability: '',
    pwd_status: 'No',
    pwd_specify: '',
    pwd_other_detail: '',
    house_no_purok: '',
    barangay: '',
    municipality: 'Pila',
    province: 'Laguna',
    portal_username: '',
  })

  useEffect(() => {
    let isMounted = true
    async function loadProfile() {
      if (!user?.id) return
      setLoading(true)
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('patient_auth_id', user.id)
        .single()
      
      if (error && error.code !== 'PGRST116') {
        setError('Failed to load profile.')
      } else if (data && isMounted) {
        const { firstName, lastName } = resolveProfileNames(data, user)
        const metaPhone = (user?.user_metadata?.phone ?? '').toString().trim()
        const pwdFields = splitPwdFields(data.disability)
        setFormData({
          first_name: firstName,
          middle_name: data.middle_name || '',
          last_name: lastName,
          philhealth_number: data.philhealth_number || '',
          birthdate: data.birthdate || '',
          sex: data.sex || '',
          mother_maiden_name: data.mother_maiden_name || '',
          civil_status: data.civil_status || '',
          religion: data.religion || '',
          blood_type: data.blood_type || '',
          mobile_phone: data.mobile_phone || data.phone || metaPhone || '',
          education: data.education || '',
          occupation: data.occupation || '',
          disability: data.disability || '',
          pwd_status: pwdFields.pwd_status,
          pwd_specify: pwdFields.pwd_specify,
          pwd_other_detail: pwdFields.pwd_other_detail,
          house_no_purok: data.house_no_purok || '',
          barangay: data.barangay || '',
          municipality: data.municipality || 'Pila',
          province: data.province || 'Laguna',
          portal_username: data.portal_username || user?.user_metadata?.portal_username || '',
        })

        if (firstName) {
          setIsEditing(false)
        } else {
          setIsEditing(true)
        }
      } else if (isMounted) {
        const { firstName, lastName } = resolveProfileNames(null, user)
        const metaPhone = (user?.user_metadata?.phone ?? '').toString().trim()
        if (firstName || lastName || metaPhone) {
          setFormData((prev) => ({
            ...prev,
            first_name: firstName || prev.first_name,
            last_name: lastName || prev.last_name,
            mobile_phone: metaPhone || prev.mobile_phone,
          }))
          setIsEditing(!firstName)
        } else {
          setIsEditing(true)
        }
      }
      if (isMounted) setLoading(false)
    }
    loadProfile()
    return () => { isMounted = false }
  }, [user?.id])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const ageValue = useMemo(() => {
    if (!formData.birthdate) return ''
    const parsed = new Date(formData.birthdate)
    if (Number.isNaN(parsed.getTime())) return ''

    const today = new Date()
    let age = today.getFullYear() - parsed.getFullYear()
    const monthDiff = today.getMonth() - parsed.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
      age -= 1
    }

    return age >= 0 ? String(age) : ''
  }, [formData.birthdate])

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setSaving(true)

    const fullName = [formData.first_name, formData.middle_name, formData.last_name].filter(Boolean).join(' ').trim()

    if (formData.pwd_status === 'Yes') {
      if (!(formData.pwd_specify || '').trim()) {
        setError('Please select a PWD / disability type.')
        setSaving(false)
        return
      }
      if (formData.pwd_specify === 'Other' && !(formData.pwd_other_detail || '').trim()) {
        setError('Please specify the disability details.')
        setSaving(false)
        return
      }
    }

    const disabilityValue = composeDisability(formData.pwd_status, formData.pwd_specify, formData.pwd_other_detail)

    const { error: updateError } = await supabase
      .from('patients')
      .update({
        first_name: formData.first_name,
        middle_name: formData.middle_name,
        last_name: formData.last_name,
        philhealth_number: formData.philhealth_number,
        birthdate: formData.birthdate || null,
        sex: formData.sex,
        mother_maiden_name: formData.mother_maiden_name,
        civil_status: formData.civil_status,
        religion: formData.religion,
        blood_type: formData.blood_type,
        mobile_phone: formData.mobile_phone,
        education: formData.education,
        occupation: formData.occupation,
        disability: disabilityValue,
        house_no_purok: formData.house_no_purok,
        barangay: formData.barangay,
        municipality: formData.municipality || 'Pila',
        province: formData.province || 'Laguna',
        name: fullName || 'Patient',
        phone: formData.mobile_phone,
      })
      .eq('patient_auth_id', user.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message || 'Failed to save profile.')
    } else {
      setInfo('Master Patient Profile updated successfully.')
      setIsEditing(false)
    }
  }

  const handleLogoutRequest = () => {
    setLogoutOpen(true)
  }

  const handleLogoutConfirm = async () => {
    setLogoutBusy(true)
    try {
      await signOut()
      window.location.href = '/login'
    } finally {
      setLogoutBusy(false)
      setLogoutOpen(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading profile...</div>

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-slate-600">
          This profile is reused for walk-ins and service requests.
        </p>
        {!isEditing && (
          <button type="button" onClick={() => setIsEditing(true)} className="secondary-btn !mt-0">
            Update profile
          </button>
        )}
      </div>

      <form className="patient-form-card" onSubmit={handleSave}>
        <fieldset disabled={!isEditing} className="group grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          
          <div className="md:col-span-3">
            <h3 className="patient-panel-title mb-4 border-b border-slate-100 pb-2">Personal information</h3>
          </div>

          <div>
            <label className="field-label" htmlFor="first_name">First Name *</label>
            <input required type="text" id="first_name" name="first_name" className="field-input" value={formData.first_name} onChange={handleChange} />
          </div>
          <div>
            <label className="field-label" htmlFor="middle_name">Middle Name</label>
            <input type="text" id="middle_name" name="middle_name" className="field-input" value={formData.middle_name} onChange={handleChange} />
          </div>
          <div>
            <label className="field-label" htmlFor="last_name">Last Name *</label>
            <input required type="text" id="last_name" name="last_name" className="field-input" value={formData.last_name} onChange={handleChange} />
          </div>

          <div>
            <label className="field-label" htmlFor="birthdate">Birthdate *</label>
            <input required type="date" id="birthdate" name="birthdate" className="field-input" value={formData.birthdate} onChange={handleChange} />
          </div>
          <div>
            <label className="field-label">Age</label>
            <input type="text" className="field-input bg-slate-50 text-slate-500 cursor-not-allowed" value={ageValue} readOnly />
            {Number(ageValue) >= 60 ? (
              <p className="mt-1 text-xs font-semibold text-violet-700">Senior Citizen — priority line (first-come, first-served)</p>
            ) : null}
          </div>
          <div>
            <label className="field-label" htmlFor="sex">Sex *</label>
            <select required id="sex" name="sex" className="field-input" value={formData.sex} onChange={handleChange}>
              <option value="">Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="civil_status">Civil Status *</label>
            <select required id="civil_status" name="civil_status" className="field-input" value={formData.civil_status} onChange={handleChange}>
              <option value="">Select...</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="blood_type">Blood Type</label>
            <select id="blood_type" name="blood_type" className="field-input" value={formData.blood_type} onChange={handleChange}>
              <option value="">Unknown</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="religion">Religion</label>
            <input type="text" id="religion" name="religion" className="field-input" value={formData.religion} onChange={handleChange} />
          </div>
          
          <div className="md:col-span-3">
            <label className="field-label" htmlFor="mother_maiden_name">Mother's Maiden Name</label>
            <input type="text" id="mother_maiden_name" name="mother_maiden_name" className="field-input" value={formData.mother_maiden_name} onChange={handleChange} />
          </div>

          <div className="md:col-span-3 mt-4">
            <h3 className="patient-panel-title border-b border-slate-100 pb-2 mb-4">Contact & Address</h3>
          </div>

          <div>
            <label className="field-label" htmlFor="mobile_phone">Mobile Phone *</label>
            <input required type="text" id="mobile_phone" name="mobile_phone" className="field-input" value={formData.mobile_phone} onChange={handleChange} />
          </div>
            <div>
              <label className="field-label">Username</label>
              <input
                type="text"
                className="field-input bg-slate-50 text-slate-500 cursor-not-allowed font-mono tracking-wider"
                value={formData.portal_username || patient?.portal_username || user?.user_metadata?.portal_username || '—'}
                readOnly
              />
            </div>
            <div className="hidden lg:block"></div>

          <div className="md:col-span-3">
            <label className="field-label" htmlFor="house_no_purok">House No. / Street / Purok *</label>
            <input required type="text" id="house_no_purok" name="house_no_purok" className="field-input" value={formData.house_no_purok} onChange={handleChange} />
          </div>
            <div>
              <label className="field-label" htmlFor="municipality">Municipality</label>
              <select
                id="municipality"
                name="municipality"
                className="field-input"
                value={formData.municipality === 'Pila' ? 'Pila' : 'Others'}
                onChange={(e) => {
                  if (e.target.value === 'Pila') {
                    setFormData((prev) => ({ ...prev, municipality: 'Pila', barangay: '' }))
                  } else {
                    setFormData((prev) => ({
                      ...prev,
                      municipality: prev.municipality === 'Pila' ? '' : prev.municipality,
                      barangay: prev.municipality === 'Pila' ? '' : prev.barangay,
                    }))
                  }
                }}
                disabled={!isEditing}
              >
                <option value="Pila">Pila</option>
                <option value="Others">Others (not from Pila)</option>
              </select>
            </div>
            {formData.municipality !== 'Pila' ? (
              <div>
                <label className="field-label" htmlFor="municipalityOther">Municipality / City name</label>
                <input
                  type="text"
                  id="municipalityOther"
                  name="municipality"
                  className="field-input"
                  value={formData.municipality}
                  onChange={handleChange}
                  disabled={!isEditing}
                  placeholder="e.g. Santa Cruz"
                />
              </div>
            ) : null}
            <div>
              <label className="field-label" htmlFor="barangay">Barangay *</label>
              {formData.municipality === 'Pila' ? (
                <select required id="barangay" name="barangay" className="field-input" value={formData.barangay} onChange={handleChange} disabled={!isEditing}>
                  <option value="">Select Barangay</option>
                  <option value="Aplaya">Aplaya</option>
                  <option value="Bagong Pook">Bagong Pook</option>
                  <option value="Bukal">Bukal</option>
                  <option value="Bulilan Norte">Bulilan Norte</option>
                  <option value="Bulilan Sur">Bulilan Sur</option>
                  <option value="Concepcion">Concepcion</option>
                  <option value="Labuin">Labuin</option>
                  <option value="Linga">Linga</option>
                  <option value="Masico">Masico</option>
                  <option value="Mojon">Mojon</option>
                  <option value="Pansol">Pansol</option>
                  <option value="Pinagbayanan">Pinagbayanan</option>
                  <option value="San Antonio">San Antonio</option>
                  <option value="San Miguel">San Miguel</option>
                  <option value="Santa Clara Norte">Santa Clara Norte</option>
                  <option value="Santa Clara Sur">Santa Clara Sur</option>
                  <option value="Tubuan">Tubuan</option>
                </select>
              ) : (
                <input required type="text" id="barangay" name="barangay" className="field-input" value={formData.barangay} onChange={handleChange} disabled={!isEditing} />
              )}
            </div>
            <div>
              <label className="field-label" htmlFor="province">Province</label>
              <input type="text" id="province" name="province" className="field-input bg-slate-50 text-slate-500" value={formData.province || 'Laguna'} readOnly />
            </div>

          <div className="md:col-span-3 mt-4">
            <h3 className="patient-panel-title border-b border-slate-100 pb-2 mb-4">Other Details</h3>
          </div>

          <div>
            <label className="field-label" htmlFor="philhealth_number">PhilHealth Number</label>
            <input type="text" id="philhealth_number" name="philhealth_number" className="field-input" value={formData.philhealth_number} onChange={handleChange} />
          </div>
          <div>
            <label className="field-label" htmlFor="education">Highest Education Attained</label>
            <select
              id="education"
              name="education"
              className="field-input"
              value={formData.education}
              onChange={handleChange}
            >
              <option value="">Select Education Level</option>
              <option value="None">None</option>
              <option value="Elementary">Elementary</option>
              <option value="Junior High School">Junior High School</option>
              <option value="Senior High School">Senior High School</option>
              <option value="College">College</option>
              <option value="Vocational">Vocational</option>
              <option value="Postgraduate">Postgraduate</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="occupation">Occupation</label>
            <select
              id="occupation"
              name="occupation"
              className="field-input"
              value={formData.occupation}
              onChange={handleChange}
            >
              <option value="">Select Occupation</option>
              <option value="Student">Student</option>
              <option value="Employed">Employed</option>
              <option value="Self-employed">Self-employed</option>
              <option value="Unemployed">Unemployed</option>
              <option value="OFW">OFW</option>
              <option value="Retired">Retired</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div>
            <label className="field-label" htmlFor="pwd_status">PWD?</label>
            <select
              id="pwd_status"
              name="pwd_status"
              className="field-input"
              value={formData.pwd_status}
              onChange={(e) => {
                const value = e.target.value
                setFormData((prev) => ({
                  ...prev,
                  pwd_status: value,
                  pwd_specify: value === 'Yes' ? prev.pwd_specify : '',
                  pwd_other_detail: value === 'Yes' ? prev.pwd_other_detail : '',
                  disability: value === 'Yes' ? prev.disability : '',
                }))
              }}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
          {formData.pwd_status === 'Yes' ? (
            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="field-label" htmlFor="pwd_specify">PWD / Disability specification *</label>
                <select
                  required
                  id="pwd_specify"
                  name="pwd_specify"
                  className="field-input"
                  value={formData.pwd_specify}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData((prev) => ({
                      ...prev,
                      pwd_specify: value,
                      pwd_other_detail: value === 'Other' ? prev.pwd_other_detail : '',
                      disability: composeDisability('Yes', value, value === 'Other' ? prev.pwd_other_detail : ''),
                    }))
                  }}
                >
                  <option value="" disabled>
                    Select disability type
                  </option>
                  {PWD_DISABILITY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              {formData.pwd_specify === 'Other' ? (
                <div>
                  <label className="field-label" htmlFor="pwd_other_detail">Please specify *</label>
                  <input
                    required
                    type="text"
                    id="pwd_other_detail"
                    name="pwd_other_detail"
                    className="field-input"
                    value={formData.pwd_other_detail}
                    onChange={(e) => {
                      const value = e.target.value
                      setFormData((prev) => ({
                        ...prev,
                        pwd_other_detail: value,
                        disability: composeDisability('Yes', 'Other', value),
                      }))
                    }}
                    placeholder="Describe the disability"
                  />
                </div>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">PWD patients join the priority line with Senior 60+ (first-come, first-served within that line).</p>
            </div>
          ) : null}
        </fieldset>

        {error && <p className="error-banner mt-6">{error}</p>}
        {info && <p className="info-banner mt-6">{info}</p>}

        <div className="mt-8 flex flex-wrap gap-3">
          {isEditing ? (
            <>
              <button type="submit" className="primary-btn mt-0!" disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              {formData.first_name && (
                <button type="button" className="secondary-btn mt-0! bg-slate-200! text-slate-800 hover:bg-slate-300!" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
              )}
            </>
          ) : (
            <button type="button" className="secondary-btn mt-0! bg-rose-100! text-rose-700 hover:bg-rose-200!" onClick={handleLogoutRequest}>
              Logout Account
            </button>
          )}
        </div>
      </form>

      <LogoutConfirmModal
        open={logoutOpen}
        busy={logoutBusy}
        onCancel={() => {
          if (!logoutBusy) setLogoutOpen(false)
        }}
        onConfirm={handleLogoutConfirm}
      />
    </section>
  )
}

