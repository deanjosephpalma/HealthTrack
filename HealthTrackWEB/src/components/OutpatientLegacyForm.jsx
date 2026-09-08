import React from 'react'

// Extracted to prevent re-renders and focus loss bugs!
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
      className="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed"
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
      className="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed"
    >
      <option value="">Select...</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
)

const CheckboxCard = ({ label, name, data, onChange, disabled }) => (
  <label className={`group relative flex items-center gap-3 rounded-xl border-2 p-3 shadow-sm transition-all ${disabled ? 'border-slate-100 bg-slate-50/30 opacity-75 cursor-not-allowed' : 'cursor-pointer border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/80'}`}>
    <input
      type="checkbox"
      name={name}
      checked={!!data[name]}
      onChange={onChange}
      disabled={disabled}
      className="peer sr-only"
    />
    <div className={`flex h-5 w-5 items-center justify-center rounded-[6px] border-2 transition-all ${disabled ? 'border-slate-300 bg-slate-100' : 'border-slate-300 bg-white peer-checked:border-indigo-600 peer-checked:bg-indigo-600 group-hover:scale-110'}`}>
      <svg className={`h-3.5 w-3.5 ${disabled && !!data[name] ? 'text-slate-500 opacity-100' : 'text-white opacity-0 transition-opacity peer-checked:opacity-100'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span className={`text-[13px] font-bold ${disabled ? 'text-slate-500' : 'text-slate-700 group-hover:text-indigo-900 peer-checked:text-indigo-800'}`}>{label}</span>
  </label>
)

export default function OutpatientLegacyForm({ data, onChange = () => {}, readOnly = false }) {
  // Pila, Laguna Barangay Coordinates Lookup - ACCURATE VERIFIED DATA
  const BARANGAY_COORDINATES = {
    'Aplaya': { latitude: 14.2579, longitude: 121.3531 },
    'Bagong Pook': { latitude: 14.2389, longitude: 121.3713 },
    'Bukal': { latitude: 14.2123, longitude: 121.3673 },
    'Bulilan Norte': { latitude: 14.2381, longitude: 121.3654 },
    'Bulilan Sur': { latitude: 14.2317, longitude: 121.3654 },
    'Concepcion': { latitude: 14.2281, longitude: 121.3778 },
    'Labuin': { latitude: 14.2463, longitude: 121.3714 },
    'Linga': { latitude: 14.2556, longitude: 121.3587 },
    'Masico': { latitude: 14.2066, longitude: 121.3804 },
    'Pansol': { latitude: 14.2179, longitude: 121.3727 },
    'Pinagbayanan': { latitude: 14.2504, longitude: 121.3605 },
    'San Antonio': { latitude: 14.2198, longitude: 121.3597 },
    'San Miguel': { latitude: 14.2038, longitude: 121.3729 },
    'Santa Clara Norte': { latitude: 14.2357, longitude: 121.3614 },
    'Santa Clara Sur': { latitude: 14.2279, longitude: 121.3649 },
    'Tubuan': { latitude: 14.2296, longitude: 121.3486 },
    'Victoria': { latitude: 14.2400, longitude: 121.3400 }
  }

  const handleChange = (e) => {
    if (readOnly) return
    const { name, value, type, checked } = e.target
    let newData = {
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
      
      {/* Header Aesthetic */}
      <div className="mb-6 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-2 flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900">
          <svg className="h-8 w-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Outpatient Medical Record
        </h2>
        <p className="font-medium text-slate-500">Please fill in the historical patient data carefully. All vital information is required for accurate reporting.</p>
      </div>

      <div className="space-y-5">
        {/* Section 1: Demographics */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">1. Patient Demographics</h3>
            <p className="text-sm text-slate-500">Basic identification and background information.</p>
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="PhilHealth Number" name="philhealth_number" data={data} onChange={handleChange} className="lg:col-span-2" placeholder="xx-xxxxxxxxx-x" disabled={readOnly} />
            <FormField label="First Name" name="first_name" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Middle Name" name="middle_name" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Last Name" name="last_name" data={data} onChange={handleChange} disabled={readOnly} />
            
            <SelectField 
              label="Civil Status" 
              name="civil_status" 
              options={["Single", "Married", "Widowed", "Separated"]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />
            
            <SelectField 
              label="Blood Type" 
              name="blood_type" 
              options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />
            
            <FormField label="Birthdate" name="birthdate" type="date" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Age" name="age" type="number" data={data} onChange={handleChange} disabled={readOnly} />
            
            <SelectField 
              label="Sex" 
              name="sex" 
              options={["Male", "Female"]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />

            <FormField label="Mobile Phone" name="mobile_phone" type="tel" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Education" name="education" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Occupation" name="occupation" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Person w/ Disability" name="disability" data={data} onChange={handleChange} disabled={readOnly} />
            
            <FormField label="Mother's Maiden Name" name="mother_maiden_name" data={data} onChange={handleChange} className="lg:col-span-2" disabled={readOnly} />
            <FormField label="Religion" name="religion" data={data} onChange={handleChange} className="lg:col-span-2" disabled={readOnly} />
          </div>
        </section>

        {/* Section 2: Address & Membership */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">2. Address & Membership Info</h3>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField label="House No. and Purok" name="house_no_purok" data={data} onChange={handleChange} disabled={readOnly} />
            <SelectField 
              label="Barangay" 
              name="barangay" 
              options={[
                "Aplaya", "Bagong Pook", "Bukal", "Bulilan Norte", "Bulilan Sur", 
                "Concepcion", "Labuin", "Linga", "Masico", "Pansol", "Pinagbayanan", 
                "San Antonio", "San Miguel", "Santa Clara Norte", "Santa Clara Sur", 
                "Tubuan", "Victoria"
              ]} 
              data={data} onChange={handleChange} disabled={readOnly}
            />
            <FormField label="Municipality & Province" name="municipality_dummy" data={{ municipality_dummy: 'Pila, Laguna' }} onChange={() => {}} className="pointer-events-none opacity-75" disabled={true} />
            <FormField label="Member's Name (If dependent)" name="member_name" data={data} onChange={handleChange} disabled={readOnly} />
            <FormField label="Member's Birthdate" name="member_birthdate" type="date" data={data} onChange={handleChange} disabled={readOnly} />
          </div>
        </section>

        {/* Section 3: Certificate Purposes */}
        <section className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-6 md:p-8 shadow-xl shadow-slate-200/40">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">3. Medical Certificate Purposes</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 mb-6">
            <CheckboxCard label="PWD" name="medcert_pwd" data={data} onChange={handleChange} disabled={readOnly} />
            <CheckboxCard label="WORK" name="medcert_work" data={data} onChange={handleChange} disabled={readOnly} />
            <CheckboxCard label="FINANCIAL" name="medcert_financial" data={data} onChange={handleChange} disabled={readOnly} />
            <CheckboxCard label="4P'S" name="medcert_4ps" data={data} onChange={handleChange} disabled={readOnly} />
            <CheckboxCard label="SCHOOL" name="medcert_school" data={data} onChange={handleChange} disabled={readOnly} />
          </div>
          <FormField label="Others (Specify)" name="medcert_others" data={data} onChange={handleChange} disabled={readOnly} />
        </section>

        {/* Two-Column Bottom Layout for dense data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left: Vitals & Consult */}
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/40">
             <div className="mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800">4. Vitals & Consultation</h3>
             </div>
             
             <FormField label="Date of Consultation" name="date_of_consultation" type="date" data={data} onChange={handleChange} className="mb-6" disabled={readOnly} />

             <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
               <FormField label="Weight (kg)" name="wt" type="number" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="Temp (°C)" name="temp" type="number" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="BP" name="bp" data={data} onChange={handleChange} placeholder="120/80" disabled={readOnly} />
               <FormField label="HR / PR" name="pr_hr" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="Resp. Rate" name="rr" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="Height (cm)" name="ht" type="number" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="SPO2 (%)" name="spo2" type="number" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="Waist (cm)" name="waist" type="number" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="Hip (cm)" name="hip" type="number" data={data} onChange={handleChange} disabled={readOnly} />
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pt-6 border-t border-slate-100">
               <FormField label="Pangalan ng Operasyon" name="operation_name" data={data} onChange={handleChange} disabled={readOnly} />
               <FormField label="Kailan Naoperahan" name="operation_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
             </div>

             <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-6">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Diagnosis</label>
                <textarea
                  name="diagnosis"
                  value={data.diagnosis || ''}
                  onChange={handleChange}
                  disabled={readOnly}
                  className="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 hover:border-slate-300 min-h-32 disabled:opacity-75 disabled:cursor-not-allowed"
                />
             </div>
          </section>

          {/* Right: Female & Vaxx */}
          <div className="space-y-8">
            
            {/* Female History */}
            <section className={`rounded-3xl border p-6 shadow-xl transition-all duration-500 ${data.sex === 'Female' ? 'border-pink-200 bg-gradient-to-br from-pink-50/50 to-white shadow-pink-200/40' : 'border-slate-100 bg-slate-50/50 shadow-slate-200/20 opacity-60 grayscale-[50%]'}`}>
               <div className="mb-6 border-b border-pink-100/50 pb-4 flex items-center gap-3">
                 <div className={`flex h-8 w-8 items-center justify-center rounded-full ${data.sex === 'Female' ? 'bg-pink-100 text-pink-600' : 'bg-slate-200 text-slate-500'}`}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                 </div>
                 <h3 className={`text-lg font-bold ${data.sex === 'Female' ? 'text-pink-900' : 'text-slate-700'}`}>5. Obstetrical History</h3>
               </div>

               {data.sex !== 'Female' && (
                 <p className="mb-6 text-sm font-medium text-slate-500 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">Select 'Female' in Demographics to activate this section.</p>
               )}

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <FormField label="Edad ng Unang Regla" name="female_age_first_menses" type="number" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="Last Menstrual Period" name="lmp" type="date" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="Gravida (G)" name="gravida" type="number" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="Para (P)" name="para" type="number" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="CS (Date)" name="cs_date" type="date" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="NSD (Date)" name="nsd_date" type="date" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="Edad ng Unang Panganganak" name="female_age_first_pregnancy" type="number" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
                 <FormField label="Menopausal Age" name="menopausal_age" type="number" data={data} onChange={handleChange} disabled={readOnly || data.sex !== 'Female'} />
               </div>
            </section>

            {/* Vaccinations */}
            <section className="rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50/50 to-white p-6 shadow-xl shadow-sky-200/30">
               <div className="mb-6 border-b border-sky-100 pb-4">
                 <h3 className="text-lg font-bold text-sky-900">6. Vaccination History</h3>
               </div>
               
               <div className="mb-6">
                 <h4 className="text-[13px] font-bold text-sky-800 uppercase tracking-wide mb-3">COVID-19</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                   <SelectField 
                     label="Brand" 
                     name="covid_vaccine_brand" 
                     options={["Pfizer", "Sinovac", "Gamaleya", "AstraZeneca", "J AND J", "Moderna"]} 
                     data={data} onChange={handleChange} disabled={readOnly}
                   />
                   <FormField label="Date Administered" name="covid_vaccine_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                 </div>
               </div>

               <div className="border-t border-sky-100/50 pt-5">
                 <h4 className="text-[13px] font-bold text-sky-800 uppercase tracking-wide mb-3">Other Vaccines (Date)</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <FormField label="FLU" name="flu_vaccine_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                   <FormField label="PNEUMO" name="pneumo_vaccine_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                   <FormField label="TD" name="td_vaccine_date" type="date" data={data} onChange={handleChange} disabled={readOnly} />
                 </div>
               </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  )
}
