import * as RadixSwitch from '@radix-ui/react-switch'

// The label is the caller's job: pass `aria-labelledby` or wrap in a <label htmlFor>.
export default function Switch({ className = '', ...props }) {
  return (
    <RadixSwitch.Root
      className={`relative h-7 w-12 shrink-0 rounded-full border border-border-strong bg-surface-inset transition-[background-color,border-color] duration-(--duration-fast) ease-out data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-fg-2 transition-[transform,background-color] duration-(--duration-fast) ease-out data-[state=checked]:translate-x-[1.35rem] data-[state=checked]:bg-accent-fg" />
    </RadixSwitch.Root>
  )
}
