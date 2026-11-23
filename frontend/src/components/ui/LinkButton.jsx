import { Link } from 'react-router'
import { buttonClasses } from './buttonStyles.js'

export default function LinkButton({ variant = 'primary', size = 'default', className, ...props }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />
}
