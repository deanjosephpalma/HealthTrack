import React from 'react'

// Custom high-end components to match standard HealthTrack styling
const FormField = ({ label, name, type = "text", required, data, onChange, className = "", placeholder = "", disabled }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    <input
      type={type}
      name={name}
      value={data[name] || ''}
      onChange={onChange}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-2xl border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed"
    />
  </div>
)

const SelectField = ({ label, name, options, required, data, onChange, className = "", disabled }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    <select
      name={name}
      value={data[name] || ''}
      onChange={onChange}
      required={required}
      disabled={disabled}
      className="w-full rounded-2xl border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed"
    >
      <option value="">Select...</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
)

export default function TbLegacyForm({ data, onChange = () => {}, readOnly = false }) {
  // Pila, Laguna Barangay Coordinates Lookup - ACCURATE VERIFIED DATA
  const BARANGAY_COORDINATES = {
    'Aplaya': { latitude: 14.2579, longitude: 121.3531 },
    'Bagong Pook': { latitude: 14.2389, longitude: 121.3713 },
    'Bukal': { latitude: 14.2123, longitude: 121.3673 },
    'Bulilan Norte (Pob.)': { latitude: 14.2381, longitude: 121.3654 },
    'Bulilan Sur (Pob.)': { latitude: 14.2317, longitude: 121.3654 },
    'Concepcion': { latitude: 14.2281, longitude: 121.3778 },
    'Labuin': { latitude: 14.2463, longitude: 121.3714 },
    'Linga': { latitude: 14.2556, longitude: 121.3587 },
    'Masico': { latitude: 14.2066, longitude: 121.3804 },
    'Mojon': { latitude: 14.2206, longitude: 121.3817 },
    'Pansol': { latitude: 14.2179, longitude: 121.3727 },
    'Pinagbayanan': { latitude: 14.2504, longitude: 121.3605 },
    'San Antonio': { latitude: 14.2198, longitude: 121.3597 },
    'San Miguel': { latitude: 14.2038, longitude: 121.3729 },
    'Sta. Clara Norte (Pob.)': { latitude: 14.2357, longitude: 121.3614 },
    'Sta. Clara Sur (Pob.)': { latitude: 14.2279, longitude: 121.3649 },
    'Tubuan': { latitude: 14.2296, longitude: 121.3486 }
  }

  const handleChange = (e) => {
    if (readOnly) return
    const { name, value, type, checked } = e.target
    const newData = {
      ...data,
      [name]: type === 'checkbox' ? checked : value
    }

    // Auto-fill latitude/longitude when barangay is selected
    if (name === 'barangay' && value && BARANGAY_COORDINATES[value]) {
      const coords = BARANGAY_COORDINATES[value]
      newData.latitude = coords.latitude
      newData.longitude = coords.longitude
    }

    if (name === 'birthdate' && value) {
      const birthDate = new Date(value)
      const today = new Date()
      let computedAge = today.getFullYear() - birthDate.getFullYear()
      const m = today.getMonth() - birthDate.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        computedAge--
      }
      newData.age = computedAge >= 0 ? computedAge : 0
    }

    onChange(newData)
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header card with distinct styling for TB - Teal and Emerald Theme */}
      <div className="mb-8 rounded-3xl bg-gradient-to-r from-teal-500 via-cyan-600 to-emerald-600 p-6 md:p-8 text-white shadow-xl shadow-teal-500/20">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-white/10 p-3 text-3xl backdrop-blur-md">
            🩺
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1">
              FORM 4B. DS-TB TREATMENT CARD
            </h2>
            <p className="text-xs md:text-sm text-teal-100 font-medium max-w-xl">
              National Tuberculosis Control Program. Please populate the case notification, demographics, screening, laboratory results, and treatment classification.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* Section 1: Facility Details */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">🏢</span>
              I. Case Finding / Notification Facility
            </h3>
            <p className="text-sm text-slate-500">Details of the diagnosing facility and code.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Diagnosing Facility" name="diagnosing_facility" required={true} data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. RHU Pila" />
            <FormField label="NTP Facility Code" name="ntp_facility_code" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. 04341205" />
            <FormField label="Province/HUC" name="facility_province" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Laguna" />
            <FormField label="Region" name="facility_region" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. IV-A" />
          </div>
        </section>

        {/* Section 2: Patient Demographic */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">👤</span>
              A. Patient Demographic
            </h3>
            <p className="text-sm text-slate-500">Personal information and contact data.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <FormField label="First Name" name="first_name" required={true} data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Middle Name" name="middle_name" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Last Name" name="last_name" required={true} data={data} onChange={handleChange} disabled={readOnly} />
            
            <FormField label="Date of Birth" name="birthdate" type="date" required={true} data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Age (Years)" name="age" type="number" required={true} data={data} onChange={handleChange} disabled={readOnly} />
            <SelectField label="Sex" name="sex" required={true} options={["Male", "Female"]} data={data} onChange={handleChange} disabled={readOnly} />
            
            <SelectField label="Civil Status" name="civil_status" options={["Single", "Married", "Widowed", "Separated"]} data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Contact Number" name="mobile_phone" type="tel" data={data} onChange={handleChange} disabled={readOnly} placeholder="09xxxxxxxxx" />
            <FormField label="PhilHealth No." name="philhealth_number" data={data} onChange={handleChange} disabled={readOnly} placeholder="xx-xxxxxxxxx-x" />
            <FormField label="Nationality" name="nationality" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Filipino" />
          </div>
        </section>

        {/* Section 3: Addresses */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">📍</span>
              Addresses
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FormField label="Permanent Address" name="permanent_address" required={true} data={data} onChange={handleChange} disabled={readOnly} placeholder="House No, Barangay, Municipality, Province" />
            <FormField label="Current Address" name="current_address" data={data} onChange={handleChange} disabled={readOnly} placeholder="If different from permanent address" />
            
            <FormField label="Purok (Current)" name="house_no_purok" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Purok 5" />
            <SelectField 
              label="Barangay (Current)" 
              name="barangay" 
              required={true}
              options={[
                "Aplaya", "Bagong Pook", "Bukal", "Bulilan Norte (Pob.)", "Bulilan Sur (Pob.)", 
                "Concepcion", "Labuin", "Linga", "Masico", "Mojon", "Pansol", "Pinagbayanan", 
                "San Antonio", "San Miguel", "Sta. Clara Norte (Pob.)", "Sta. Clara Sur (Pob.)", 
                "Tubuan"
              ]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />
          </div>
        </section>

        {/* Section 4: Screening Information */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">🔍</span>
              B. Screening Information
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <SelectField label="Referred By" name="tb_referred_by" options={["Public", "Other Public", "Private", "Community"]} data={data} onChange={handleChange} disabled={readOnly} />
            <SelectField label="Mode of Screening" name="tb_screening_mode" options={["PCF (Passive Case Finding)", "ACF (Active Case Finding)", "ICF (Intensified Case Finding)", "ECF (Enhanced Case Finding)"]} data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Date of Screening" name="tb_screening_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
          </div>
        </section>

        {/* Section 5: Laboratory Tests */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-rose-500">🔬</span>
              C. Laboratory Tests
            </h3>
            <p className="text-sm text-slate-500">Enter dates and test outcomes exactly as verified.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-xs font-black uppercase text-teal-600 tracking-wider mb-3">Xpert MTB/RIF / ULTRA</p>
              <div className="grid gap-4 grid-cols-2">
                <FormField label="Collection Date" name="lab_xpert_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                <FormField label="Result" name="lab_xpert_result" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. MTB Detected, Medium" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-xs font-black uppercase text-teal-600 tracking-wider mb-3">Smear Microscopy / TB LAMP</p>
              <div className="grid gap-4 grid-cols-2">
                <FormField label="Collection Date" name="lab_smear_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                <FormField label="Result" name="lab_smear_result" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Negative" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-xs font-black uppercase text-teal-600 tracking-wider mb-3">Chest X-ray</p>
              <div className="grid gap-4 grid-cols-2">
                <FormField label="Examination Date" name="lab_xray_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                <FormField label="Result" name="lab_xray_result" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. PTB, Left Lung" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-xs font-black uppercase text-teal-600 tracking-wider mb-3">Tuberculin Skin Test (TST)</p>
              <div className="grid gap-4 grid-cols-2">
                <FormField label="Reading Date" name="lab_tst_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                <FormField label="Result" name="lab_tst_result" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. 10mm" />
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Diagnosis */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">💊</span>
              D. Diagnosis details
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            <SelectField label="Diagnosis Outcome" name="tb_diagnosis" required={true} options={["TB Disease", "TB Infection"]} data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Date of Diagnosis" name="tb_date_of_diagnosis" type="date" required={true} data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Date of Notification" name="tb_date_of_notification" type="date" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="TB Case Number" name="tb_case_number" required={true} data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. 26230097" />
            <FormField label="Attending Physician" name="tb_physician" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Dr. Santos" />
            <FormField label="Referred To (Facility)" name="tb_referred_to" data={data} onChange={handleChange} disabled={readOnly} className="sm:col-span-2" placeholder="Facility Name & Address" />
          </div>
        </section>

        {/* Section 7: TB Disease Classification */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">🧬</span>
              E. TB Disease Classification
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SelectField label="Bacteriological Status" name="tb_bacteriological_status" required={true} options={["Bacteriologically-confirmed TB", "Clinically-diagnosed TB"]} data={data} onChange={handleChange} disabled={readOnly} />
            <SelectField label="Anatomical Site" name="tb_anatomical_site" required={true} options={["Pulmonary", "Extra-pulmonary"]} data={data} onChange={handleChange} disabled={readOnly} />
            {data.tb_anatomical_site === 'Extra-pulmonary' && (
              <FormField label="Specify Extra-pulmonary Site" name="tb_extra_pulmonary_site" required={true} data={data} onChange={handleChange} disabled={readOnly} className="sm:col-span-2" placeholder="e.g. Lymph Nodes, Spine" />
            )}
            
            <SelectField 
              label="Drug Resistance Status" 
              name="tb_drug_resistance" 
              required={true}
              options={[
                "Drug-susceptible", 
                "Bacteriologically-confirmed RR-TB (Rifampicin Resistant)", 
                "Bacteriologically-confirmed MDR-TB (Multidrug Resistant)", 
                "Bacteriologically-confirmed XDR-TB (Extensively Drug Resistant)", 
                "Clinically-diagnosed MDR-TB", 
                "Other Drug-resistant TB"
              ]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />
            
            <SelectField 
              label="Registration Group" 
              name="tb_registration_group" 
              required={true}
              options={["New", "Relapse", "TALF (Treatment After Loss to Follow-up)", "TAF (Treatment After Failure)", "PTOU (Previous Treatment Outcome Unknown)", "Unknown History"]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />
          </div>
        </section>

        {/* Section 8: Treatment Clinical Notes */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-teal-500">📝</span>
              Additional Treatment & Progress Notes
            </h3>
          </div>
          <textarea
            name="notes"
            value={data.notes || ''}
            onChange={handleChange}
            disabled={readOnly}
            placeholder="Write clinical follow-ups, sputum test schedules, regimen details (e.g., HRZE), or remarks here..."
            className="w-full rounded-2xl border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 hover:border-slate-300 min-h-32 disabled:opacity-75 disabled:cursor-not-allowed"
          />
        </section>

      </div>
    </div>
  )
}
