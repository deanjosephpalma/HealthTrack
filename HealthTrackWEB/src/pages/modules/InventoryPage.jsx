import { useEffect, useState } from 'react'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'

export default function InventoryPage() {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState({
    item_name: '',
    stock_quantity: '0',
    unit: 'pcs',
    notes: '',
  })

  useEffect(() => {
    let isMounted = true

    const loadInventoryData = async () => {
      setLoading(true)
      setError('')

      const { data, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('id, item_name, stock_quantity, unit, notes, updated_at')
        .order('item_name', { ascending: true })

      if (!isMounted) {
        return
      }

      if (inventoryError) {
        setError(inventoryError.message)
        setInventory([])
        setLoading(false)
        return
      }

      setInventory(data ?? [])
      setLoading(false)
    }

    loadInventoryData()

    return () => {
      isMounted = false
    }
  }, [])

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)

    const itemName = formData.item_name.trim()
    if (!itemName) {
      setFormError('Item name is required.')
      setFormLoading(false)
      return
    }

    const stockRaw = (formData.stock_quantity ?? '').toString().trim()
    const stockQty = stockRaw ? Number(stockRaw) : 0
    if (!Number.isFinite(stockQty) || stockQty < 0) {
      setFormError('Stock quantity must be a non-negative number.')
      setFormLoading(false)
      return
    }

    const unit = (formData.unit ?? '').toString().trim() || 'pcs'

    const { data: createdItem, error: insertError } = await supabase
      .from('inventory_items')
      .insert([
        {
          item_name: itemName,
          stock_quantity: stockQty,
          unit,
          notes: formData.notes.trim() || null,
        },
      ])
      .select('id')
      .single()

    if (insertError) {
      setFormError(insertError.message)
      setFormLoading(false)
      return
    }

    void logAuditEvent({
      action: 'inventory_item_create',
      entityType: 'inventory_items',
      entityId: createdItem?.id ?? null,
      metadata: { item_name: itemName, stock_quantity: stockQty, unit },
    })

    setFormData({
      item_name: '',
      stock_quantity: '0',
      unit: 'pcs',
      notes: '',
    })
    setShowForm(false)
    setFormLoading(false)
    setLoading(true)

    const { data, error: inventoryError } = await supabase
      .from('inventory_items')
      .select('id, item_name, stock_quantity, unit, notes, updated_at')
      .order('item_name', { ascending: true })

    if (inventoryError) {
      setError(inventoryError.message)
      setInventory([])
      setLoading(false)
      return
    }

    setInventory(data ?? [])
    setLoading(false)
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredInventory =
    normalizedQuery.length === 0
      ? inventory
      : inventory.filter((item) => {
          const itemName = (item.item_name ?? '').toString().toLowerCase()
          const unit = (item.unit ?? '').toString().toLowerCase()
          const stock = (item.stock_quantity ?? '').toString().toLowerCase()
          const notes = (item.notes ?? '').toString().toLowerCase()
          return (
            itemName.includes(normalizedQuery) ||
            unit.includes(normalizedQuery) ||
            stock.includes(normalizedQuery) ||
            notes.includes(normalizedQuery)
          )
        })

  return (
    <section className="module-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="module-title">Inventory Management</h2>
          <p className="module-subtitle">Add rural health supplies and track remaining stock in real time.</p>
        </div>

        <button
          type="button"
          className="px-8 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setShowForm((prev) => !prev)}
        >
          {showForm ? 'Cancel' : 'Add Item'}
        </button>
      </div>

      <div className="mb-4">
        <label className="field-label" htmlFor="inventory-search">
          Search
        </label>
        <input
          id="inventory-search"
          type="text"
          className="field-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by item name, unit, or stock quantity"
        />
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Add Inventory Item</h3>

          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="item_name">
                Item Name *
              </label>
              <input
                id="item_name"
                name="item_name"
                type="text"
                required
                className="field-input"
                value={formData.item_name}
                onChange={handleFormChange}
                placeholder="e.g. Paracetamol 500mg"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="stock_quantity">
                  Stock Quantity
                </label>
                <input
                  id="stock_quantity"
                  name="stock_quantity"
                  type="number"
                  min="0"
                  className="field-input"
                  value={formData.stock_quantity}
                  onChange={handleFormChange}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="unit">
                  Unit
                </label>
                <input
                  id="unit"
                  name="unit"
                  type="text"
                  className="field-input"
                  value={formData.unit}
                  onChange={handleFormChange}
                  placeholder="pcs"
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="notes">
                Notes
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                className="field-input"
                value={formData.notes}
                onChange={handleFormChange}
                placeholder="Optional"
              />
            </div>

            {formError && <p className="error-banner">{formError}</p>}
            <button type="submit" className="primary-btn" disabled={formLoading}>
              {formLoading ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      ) : null}

      {loading && <p className="info-banner mb-4">Loading inventory...</p>}
      {error && <p className="error-banner mb-4">Inventory error: {error}</p>}

      {!loading && inventory.length === 0 ? (
        <ModuleEmptyState
          title="No stock available"
          description="Add items to start tracking supplies."
        />
      ) : !loading && filteredInventory.length === 0 ? (
        <ModuleEmptyState
          title="No matching inventory items"
          description="Try a different search term (item name, unit, stock quantity, or notes)."
        />
      ) : (
        <div className="space-y-3">
          {filteredInventory.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{item.item_name}</h3>
                  <p className="text-sm text-slate-600">Current stock</p>
                  {item.notes ? <p className="mt-1 text-sm text-slate-600">{item.notes}</p> : null}
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  {item.stock_quantity} {item.unit}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
