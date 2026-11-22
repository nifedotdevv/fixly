import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../lib/api.js'
import { clearSession, getToken, onSessionChange, setToken } from '../lib/session.js'
import { queryKeys } from '../lib/queryClient.js'
import { AuthContext } from './auth-context.js'
import { normalizeUser } from './roles.js'

export default function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [hasToken, setHasToken] = useState(() => Boolean(getToken()))

  // How the session ended and at which location, so RequireAuth redirects to the right place.
  const [ended, setEnded] = useState(null)

  const pathRef = useRef('')
  const keyRef = useRef('')
  useEffect(() => {
    pathRef.current = location.pathname + location.search
    keyRef.current = location.key
  }, [location.pathname, location.search, location.key])

  useEffect(
    () =>
      onSessionChange((reason) => {
        setHasToken(Boolean(getToken()))
        setEnded({ reason, key: keyRef.current })
        if (reason === 'expired') {
          const next = encodeURIComponent(pathRef.current || '/')
          navigate(`/login?next=${next}&expired=1`, { replace: true })
        }
      }),
    [navigate],
  )

  const meQuery = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api('/users/me'),
    select: (res) => normalizeUser(res.data),
    enabled: hasToken,
  })

  const me = hasToken ? (meQuery.data ?? null) : null
  let status = 'signed-out'
  if (hasToken && me) status = 'signed-in'
  else if (hasToken && !meQuery.isError) status = 'loading'

  const signIn = useCallback(
    (token, user) => {
      setToken(token)
      queryClient.setQueryData(queryKeys.me(), { data: user })
      setHasToken(true)
      setEnded(null)
    },
    [queryClient],
  )

  const signOut = useCallback(() => {
    clearSession()
    navigate('/', { replace: true })
  }, [navigate])

  const endReasonFor = useCallback((key) => (ended?.key === key ? ended.reason : null), [ended])

  const value = useMemo(
    () => ({ me, status, signIn, signOut, endReasonFor }),
    [me, status, signIn, signOut, endReasonFor],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
