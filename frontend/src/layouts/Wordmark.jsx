import { Link } from 'react-router'

export default function Wordmark({ to = '/', className = '' }) {
  return (
    <Link to={to} translate="no" className={`font-display text-h3 font-black tracking-tight ${className}`}>
      Fixly
    </Link>
  )
}
