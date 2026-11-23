import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, ConfirmDialog, useToast } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { Notice, Section } from './shared.jsx'

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX = 5 * 1024 * 1024

const UPLOAD_ERRORS = {
  413: 'That photo is over 5 MB. Choose a smaller one.',
  429: 'Too many photo uploads. Try again in a few minutes.',
  503: "Photo uploads aren't available right now",
}

export default function PhotoSection({ me }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const setAvatar = (avatar) =>
    qc.setQueryData(queryKeys.me(), (old) => (old ? { ...old, data: { ...old.data, avatar } } : old))

  function onPick(e) {
    const picked = e.target.files?.[0]
    setError('')
    setPreview(null)
    if (!picked) return setFile(null)
    const reason = !TYPES.includes(picked.type)
      ? 'Choose a JPEG, PNG or WEBP image.'
      : picked.size > MAX ? 'That photo is over 5 MB. Choose a smaller one.' : ''
    if (reason) {
      setFile(null)
      setError(reason)
      inputRef.current.value = ''
      inputRef.current.focus()
    } else {
      setFile(picked)
      if (URL.createObjectURL) setPreview(URL.createObjectURL(picked))
    }
  }

  async function upload() {
    setError('')
    setLoading(true)
    const formData = new FormData()
    formData.append('image', file)
    try {
      const { data } = await api('/users/me/avatar', { method: 'PUT', formData })
      setAvatar(data.avatar)
      setFile(null)
      setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      toast({ title: 'Photo saved', tone: 'success' })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(UPLOAD_ERRORS[err.status] ?? err.message)
    }
    setLoading(false)
  }

  async function remove() {
    setRemoveError('')
    try {
      await api('/users/me/avatar', { method: 'DELETE' })
      setAvatar(null)
      toast({ title: 'Photo removed', tone: 'success' })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      // 503 means the avatar is already cleared on the server and only image cleanup is pending.
      if (err.status === 503) {
        setAvatar(null)
        qc.invalidateQueries({ queryKey: queryKeys.me() })
        toast({ title: 'Photo removed. Cleanup is still finishing.' })
        return
      }
      qc.invalidateQueries({ queryKey: queryKeys.me() })
      setRemoveError(err.message)
      throw err
    }
  }

  return (
    <Section title="Photo" description="JPEG, PNG or WEBP, up to 5 MB.">
      <div className="flex items-center gap-4">
        {preview ? (
          <img src={preview} alt="Preview of the new photo" width={64} height={64} className="size-16 shrink-0 rounded-full bg-surface-inset object-cover" />
        ) : (
          <Avatar src={me.avatar?.url} role={me.role} name={`${me.firstName} ${me.lastName}`} size={64} />
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="avatar-file" className="font-medium">Choose a photo</label>
          <input
            ref={inputRef}
            id="avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'avatar-error' : undefined}
            className="text-caption text-fg-2"
          />
        </div>
      </div>
      {error && <Notice><span id="avatar-error">{error}</span></Notice>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={upload} loading={loading} loadingLabel="Uploading" disabled={!file}>Upload photo</Button>
        {me.avatar?.url && (
          <ConfirmDialog
            trigger={<Button variant="secondary">Remove photo</Button>}
            title="Remove your photo?"
            description="Fixly will show the default avatar for your role instead."
            confirmLabel="Remove photo"
            loadingLabel="Removing"
            error={removeError}
            onOpenChange={(o) => o && setRemoveError('')}
            onConfirm={remove}
          />
        )}
      </div>
    </Section>
  )
}
