import { CONTROL, cn } from './cn.js'

export default function Select({ className, children, ...props }) {
  return <select className={cn(CONTROL, className)} {...props}>{children}</select>
}
