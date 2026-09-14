import { useEffect, useState } from 'react'

const STORAGE_KEY = 'healthtrack-reading-size'
const sizes = ['standard', 'large', 'largest']

export default function ReadingControls() {
  const [size, setSize] = useState(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); return sizes.includes(saved) ? saved : 'standard' }
    catch { return 'standard' }
  })

  useEffect(() => {
    document.documentElement.dataset.readingSize = size
    try { localStorage.setItem(STORAGE_KEY, size) } catch { /* Reading controls still work without storage. */ }
    return () => { delete document.documentElement.dataset.readingSize }
  }, [size])

  return (
    <section className="reading-controls" aria-label="Reading preferences / Laki ng sulat">
      <label htmlFor="reading-size">Laki ng sulat / Text size</label>
      <select id="reading-size" value={size} onChange={(event) => setSize(event.target.value)}>
        <option value="standard">Normal</option>
        <option value="large">Malaki / Large</option>
        <option value="largest">Pinakamalaki / Largest</option>
      </select>
      <p>Maaaring mag-zoom sa browser para palakihin pa ang pahina.</p>
    </section>
  )
}
