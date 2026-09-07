export default function ModuleEmptyState({ title, description }) {
  return (
    <div className="patient-empty">
      <h3 className="patient-empty-title">{title}</h3>
      <p className="patient-empty-desc">{description}</p>
    </div>
  )
}
