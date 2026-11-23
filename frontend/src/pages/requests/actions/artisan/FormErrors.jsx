// Server messages from a 400 (or any other failure) shown beside the fields.
export default function FormErrors({ mutation }) {
  const messages = mutation.errors?.length ? mutation.errors : mutation.error ? [mutation.error.message] : []
  if (!messages.length) return null
  return (
    <div role="alert" className="flex flex-col gap-1 text-caption text-error">
      {messages.map((m) => <p key={m}>{m}</p>)}
    </div>
  )
}
