export default function EmptyState({ message, action }) {
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <p className="text-fg-2 max-w-[60ch]">{message}</p>
      {action}
    </div>
  )
}
