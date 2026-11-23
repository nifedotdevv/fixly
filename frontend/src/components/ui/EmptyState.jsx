export default function EmptyState({ icon: Icon, message, action }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-[14px] bg-lime-soft text-ink">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <p className="max-w-[48ch] text-center text-body text-muted">{message}</p>
      {action}
    </div>
  )
}
