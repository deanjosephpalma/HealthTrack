import React from 'react'

// Custom high-end components to match the Outpatient form styling
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
      className="w-full rounded-2xl border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed"
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
      className="w-full rounded-2xl border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 hover:border-slate-300 disabled:opacity-75 disabled:cursor-not-allowed"
    >
      <option value="">Select...</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
)

export default function AnimalBiteLegacyForm({ data, onChange = () => {}, readOnly = false }) {
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

    onChange(newData)
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Banner - Amber & Rose Rabies Awareness Rabies Theme */}
      <div className="mb-6 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 p-6 md:p-8 text-white shadow-xl shadow-amber-500/10">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-white/10 p-3 text-3xl backdrop-blur-md animate-bounce">
            🐾
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight mb-1">
              Animal Bite Logbook Entry
            </h2>
            <p className="text-xs md:text-sm text-amber-100 font-medium max-w-xl">
              Strictly matched to the physical registry layout. Fill in the columns exactly as written in the logbook paper records.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* Core Logbook Form Card */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl shadow-slate-200/40">
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            
            {/* COLUMN 1: NAME OF PATIENT */}
            <div className="md:col-span-3">
              <span className="text-xs font-black uppercase text-amber-600 tracking-widest block mb-3 border-l-4 border-amber-500 pl-2">
                Name of Patient
              </span>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="First Name" name="first_name" required={true} data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Juan" />
                <FormField label="Middle Name" name="middle_name" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Santos" />
                <FormField label="Last Name" name="last_name" required={true} data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Dela Cruz" />
              </div>
            </div>

            {/* COLUMN 2: ADDRESS */}
            <div className="md:col-span-3 border-t border-slate-100 pt-6">
              <span className="text-xs font-black uppercase text-amber-600 tracking-widest block mb-3 border-l-4 border-amber-500 pl-2">
                Address
              </span>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="House No. / Purok" name="house_no_purok" data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. Purok 3, House 12" />
                <SelectField 
                  label="Barangay" 
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
            </div>

            {/* COLUMN 3: AGE & SEX */}
            <div className="md:col-span-3 border-t border-slate-100 pt-6">
              <span className="text-xs font-black uppercase text-amber-600 tracking-widest block mb-3 border-l-4 border-amber-500 pl-2">
                Demographics
              </span>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Age" name="age" type="number" required={true} data={data} onChange={handleChange} disabled={readOnly} placeholder="e.g. 24" />
                <SelectField 
                  label="Sex" 
                  name="sex" 
                  required={true}
                  options={["Male", "Female"]} 
                  data={data} onChange={handleChange} disabled={readOnly}
                />
              </div>
            </div>

            {/* COLUMN 4: BITE EXPOSURE & SITE DETAILS */}
            <div className="md:col-span-3 border-t border-slate-100 pt-6">
              <span className="text-xs font-black uppercase text-amber-600 tracking-widest block mb-3 border-l-4 border-amber-500 pl-2">
                Bite & Consultation Details
              </span>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <FormField 
                  label="Date (Bite/Consultation)" 
                  name="date_of_consultation" 
                  type="date" 
                  required={true} 
                  data={data} 
                  onChange={handleChange} 
                  disabled={readOnly}
                />
                
                <FormField 
                  label="Place of Bite" 
                  name="bite_place" 
                  required={true}
                  data={data} 
                  onChange={handleChange} 
                  disabled={readOnly}
                  placeholder="Where biting occurred"
                />
                
                <SelectField 
                  label="Type of Animal" 
                  name="animal_type" 
                  required={true}
                  options={["PC (Personal/Pet Cat)", "PD (Personal/Pet Dog)", "SC (Stray Cat)", "SD (Stray Dog)"]} 
                  data={data} 
                  onChange={handleChange} 
                  disabled={readOnly}
                />
                
                <SelectField 
                  label="Type (B/NB)" 
                  name="bite_type" 
                  required={true}
                  options={["B (Bite)", "NB (Non-Bite)"]} 
                  data={data} 
                  onChange={handleChange} 
                  disabled={readOnly}
                />
                
                <FormField 
                  label="Site (Body Part)" 
                  name="bite_site" 
                  required={true}
                  data={data} 
                  onChange={handleChange} 
                  disabled={readOnly}
                  placeholder="e.g. Left Leg"
                />
              </div>
            </div>

            {/* COLUMN 5: EXTRA CLINICAL NOTES (OPTIONAL) */}
            <div className="md:col-span-3 border-t border-slate-100 pt-6">
              <span className="text-xs font-black uppercase text-amber-600 tracking-widest block mb-3 border-l-4 border-amber-500 pl-2">
                Additional Notes
              </span>
              <textarea
                name="notes"
                value={data.notes || ''}
                onChange={handleChange}
                disabled={readOnly}
                placeholder="Write any additional treatment details, vaccine brands, or follow-ups here (optional)..."
                className="w-full rounded-2xl border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 hover:border-slate-300 min-h-24 disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>

          </div>
        </section>

      </div>
    </div>
  )
}
