import { useState } from 'react'

const ROLES = ['house_owner', 'artisan', 'admin']
const SIZES = { 32: 'size-8', 40: 'size-10', 64: 'size-16' }
const roleUrl = (role) => `/avatars/${ROLES.includes(role) ? role : 'house_owner'}.svg`

function AvatarImage({ src, role, name, size, decorative }) {
  // 0: uploaded src, 1: role default, 2: house_owner default
  const chain = [src, roleUrl(role), roleUrl('house_owner')].filter(Boolean)
  const [step, setStep] = useState(0)
  return (
    <img
      src={chain[Math.min(step, chain.length - 1)]}
      alt={decorative ? '' : name || 'Former Fixly user'}
      width={size}
      height={size}
      onError={() => setStep((s) => s + 1)}
      className={`${SIZES[size]} rounded-full object-cover bg-surface-2 outline outline-1 -outline-offset-1 outline-fg/10 shrink-0`}
    />
  )
}

// `decorative` blanks the alt text for when the person's name is already visible beside the avatar.
export default function Avatar({ src, role = 'house_owner', name, size = 40, decorative = false }) {
  const px = size in SIZES ? size : 40
  return <AvatarImage key={`${src}|${role}`} src={src} role={role} name={name} size={px} decorative={decorative} />
}
