import { useEffect, useRef } from 'react'

export default function useDataSync(reload) {
  const latest = useRef(reload)
  latest.current = reload
  useEffect(() => {
    let timer
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      clearTimeout(timer)
      timer = setTimeout(() => Promise.resolve(latest.current()).catch(() => {}), 300)
    }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('auramed:data-changed', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auramed-data') : null
    if (channel) channel.onmessage = refresh
    return () => { clearTimeout(timer); window.removeEventListener('auramed:data-changed', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); channel?.close() }
  }, [])
}
