import { CONTROL, cn } from './cn.js'

export default function Textarea({ className, rows = 4, ...props }) {
  return <textarea rows={rows} className={cn(CONTROL, 'h-auto py-2', className)} {...props} />
}
