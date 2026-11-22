import { useState } from 'react'

const ROLES = ['house_owner', 'artisan', 'admin']
const SIZES = { 32: 'size-8', 40: 'size-10', 64: 'size-16' }
const roleUrl = (role) => `/avatars/${ROLES.includes(role) ? role : 'house_owner'}.svg`

function AvatarImage({ src, role, name, size }) {
  // 0: uploaded src, 1: role default, 2: house_owner default
  const chain = [src, roleUrl(role), roleUrl('house_owner')].filter(Boolean)
  const [step, setStep] = useState(0)
  return (
    <img
      src={chain[Math.min(step, chain.length - 1)]}
      alt={name || 'Former Fixly user'}
      width={size}
      height={size}
      onError={() => setStep((s) => s + 1)}
      className={`${SIZES[size]} rounded-full object-cover bg-surface-inset outline outline-1 -outline-offset-1 outline-black/10 shrink-0`}
    />
  )
}

export default function Avatar({ src, role = 'house_owner', name, size = 40 }) {
  return <AvatarImage key={`${src}|${role}`} src={src} role={role} name={name} size={size} />
}
