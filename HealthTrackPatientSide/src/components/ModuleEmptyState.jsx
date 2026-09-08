export default function ModuleEmptyState({ title, description }) {
  return (
    <div className="patient-empty" role="status">
      <span className="patient-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M5 5h14v14H5z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      </span>
      <h3 className="patient-empty-title">{title}</h3>
      <p className="patient-empty-desc">{description}</p>
    </div>
  )
}
