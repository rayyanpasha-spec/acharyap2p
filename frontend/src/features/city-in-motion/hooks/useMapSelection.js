// Selection state only (which complaint / vehicle / bin is open in the details panel). The map instance lives in a ref elsewhere.
import { useCallback, useEffect, useState } from 'react'

export function useMapSelection() {
  const [selection, setSelection] = useState(null) // { type: 'complaint'|'vehicle'|'bin', id: string, nonce }

  const select = useCallback((type, id) => {
    if (!type || id == null) return
    setSelection((cur) => (cur && cur.type === type && cur.id === String(id) ? cur : { type, id: String(id), nonce: Date.now() }))
  }, [])
  const clear = useCallback(() => setSelection(null), [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { selection, select, clear }
}

export default useMapSelection
