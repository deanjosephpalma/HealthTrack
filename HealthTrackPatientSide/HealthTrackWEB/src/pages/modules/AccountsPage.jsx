import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/apiClient'
import { useAuth } from '../../context/useAuth'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
      <path d="M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a12.4 12.4 0 01-4.2 5.1" />
      <path d="M6.7 6.7A12.4 12.4 0 001 12.5C2.7 16.9 7 20 12 20a9.8 9.8 0 005.1-1.4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5C21.3 16.9 17 20 12 20S2.7 16.9 1 12.5z" />
      <circle cx="12" cy="12.5" r="3" />
    </svg>
  )
}

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'staff', label: 'Staff' },
  { id: 'patient', label: 'Patients' },
]

export default function AccountsPage() {
  const { profile, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [resettingUserId, setResettingUserId] = useState('')
  const [newPasswordByUser, setNewPasswordByUser] = useState({})
  const [revealed, setRevealed] = useState({})
  const [showAllPasswords, setShowAllPasswords] = useState(false)

  const managerName = normalize(import.meta.env.VITE_ACCOUNT_MANAGER_NAME || 'Alma Divinagracia')
  const managerEmail = normalize(import.meta.env.VITE_ACCOUNT_MANAGER_EMAIL || '')
  const isManager =
    normalize(profile?.name) === managerName || (managerEmail && normalize(profile?.email || user?.email) === managerEmail)

  async function loadAccounts() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/accounts', { method: 'GET' })
      setAccounts(Array.isArray(res?.accounts) ? res.accounts : [])
    } catch (err) {
      setError(err?.message || 'Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isManager) {
      setLoading(false)
      setError('Only Alma Divinagracia can access this page.')
      return
    }
    void loadAccounts()
  }, [isManager])

  const counts = useMemo(() => {
    const staff = accounts.filter((a) => a.account_type === 'staff').length
    const patient = accounts.filter((a) => a.account_type === 'patient').length
    return { all: accounts.length, staff, patient }
  }, [accounts])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return accounts.filter((item) => {
      if (typeFilter !== 'all' && item.account_type !== typeFilter) return false
      if (!needle) return true
      return [item.name, item.email, item.username, item.phone, item.role, item.account_type, item.password].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(needle),
      )
    })
  }, [accounts, query, typeFilter])

  const handleReset = async (userId) => {
    const newPassword = String(newPasswordByUser[userId] || '')
    if (!newPassword) return
    setResettingUserId(userId)
    setError('')
    try {
      const res = await apiFetch('/accounts/reset-password', {
        method: 'POST',
        body: { user_id: userId, new_password: newPassword },
      })
      setAccounts((prev) =>
        prev.map((row) => (row.user_id === userId ? { ...row, password: res?.password || newPassword } : row)),
      )
      setNewPasswordByUser((prev) => ({ ...prev, [userId]: '' }))
      setRevealed((prev) => ({ ...prev, [userId]: true }))
    } catch (err) {
      setError(err?.message || 'Could not reset password.')
    } finally {
      setResettingUserId('')
    }
  }

  const copyText = async (text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  if (!isManager) {
    return (
      <section className="accounts-panel">
        <h2 className="text-lg font-semibold text-slate-900">Accounts</h2>
        <p className="mt-3 text-sm text-rose-700">{error || 'Forbidden'}</p>
      </section>
    )
  }

  return (
    <section className="accounts-panel space-y-5">
      <div className="accounts-toolbar">
        <div>
          <p className="accounts-kicker">Account manager</p>
          <h2 className="accounts-heading">Staff & patient directory</h2>
          <p className="accounts-sub">
            Search, view credentials, and reset passwords for Patient, Nurse, Doctor, BHW, and Volunteer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="accounts-ghost-btn" onClick={() => setShowAllPasswords((v) => !v)}>
            {showAllPasswords ? 'Hide passwords' : 'Show passwords'}
          </button>
          <button type="button" className="accounts-primary-btn" onClick={loadAccounts} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="accounts-search-card">
        <div className="accounts-search-row">
          <label className="accounts-search-field">
            <span className="accounts-search-icon">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="accounts-search-input"
              placeholder="Search by name, username, email, role, phone…"
              autoComplete="off"
            />
            {query ? (
              <button type="button" className="accounts-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                Clear
              </button>
            ) : null}
          </label>
        </div>

        <div className="accounts-filter-row" role="tablist" aria-label="Account type">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={typeFilter === filter.id}
              className={typeFilter === filter.id ? 'accounts-chip accounts-chip-active' : 'accounts-chip'}
              onClick={() => setTypeFilter(filter.id)}
            >
              {filter.label}
              <span className="accounts-chip-count">{counts[filter.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <p className="accounts-result-meta">
          Showing <strong>{filtered.length}</strong> of {accounts.length} accounts
        </p>
      </div>

      {error ? <p className="accounts-error">{error}</p> : null}

      <div className="accounts-table-shell">
        {loading ? (
          <div className="accounts-empty">Loading accounts…</div>
        ) : (
          <div className="accounts-table-scroll">
            <table className="accounts-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Role</th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Password</th>
                  <th>Reset</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isRevealed = showAllPasswords || Boolean(revealed[item.user_id])
                  const passwordValue = item.password || ''
                  return (
                    <tr key={`${item.account_type}-${item.user_id}`}>
                      <td>
                        <span className={item.account_type === 'patient' ? 'accounts-badge accounts-badge-patient' : 'accounts-badge accounts-badge-staff'}>
                          {item.account_type}
                        </span>
                      </td>
                      <td>{item.role || '—'}</td>
                      <td className="accounts-name">{item.name || '—'}</td>
                      <td>
                        <div className="accounts-cred">
                          <code>{item.username || '—'}</code>
                          {item.username ? (
                            <button type="button" className="accounts-mini-btn" onClick={() => copyText(item.username)}>
                              Copy
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="accounts-muted">{item.email || '—'}</td>
                      <td className="accounts-muted">{item.phone || '—'}</td>
                      <td>
                        <div className="accounts-cred">
                          <code className="accounts-password">{passwordValue ? (isRevealed ? passwordValue : '••••••••') : '—'}</code>
                          {passwordValue ? (
                            <>
                              <button
                                type="button"
                                className="accounts-icon-btn"
                                onClick={() => setRevealed((prev) => ({ ...prev, [item.user_id]: !prev[item.user_id] }))}
                                aria-label={isRevealed ? 'Hide password' : 'Show password'}
                              >
                                <EyeIcon open={isRevealed} />
                              </button>
                              <button type="button" className="accounts-mini-btn" onClick={() => copyText(passwordValue)}>
                                Copy
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="accounts-reset-row">
                          <input
                            type="text"
                            className="accounts-reset-input"
                            placeholder="New password"
                            value={newPasswordByUser[item.user_id] || ''}
                            onChange={(e) =>
                              setNewPasswordByUser((prev) => ({
                                ...prev,
                                [item.user_id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="accounts-reset-btn"
                            onClick={() => handleReset(item.user_id)}
                            disabled={resettingUserId === item.user_id || !(newPasswordByUser[item.user_id] || '').trim()}
                          >
                            {resettingUserId === item.user_id ? '…' : 'Reset'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!filtered.length ? (
                  <tr>
                    <td className="accounts-empty-cell" colSpan={8}>
                      No accounts match your search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
