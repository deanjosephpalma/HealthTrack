export default function ModuleEmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <h3 className="module-title text-xl">{title}</h3>
      <p className="module-subtitle mb-0">{description}</p>
    </div>
  )
}
