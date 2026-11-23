import { CONTROL, cn } from './cn.js'

export default function Input({ className, type = 'text', ...props }) {
  return <input type={type} className={cn(CONTROL, className)} {...props} />
}
