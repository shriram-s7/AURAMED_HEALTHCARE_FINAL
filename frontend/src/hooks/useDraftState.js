import { useCallback, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { readAuthStorage } from '../services/api'

const cache = new Map()
const listeners = new Set()
export function draftScope() {
  const auth = readAuthStorage()
  return auth?.token?.startsWith('public-demo.') ? `hosted-demo:${auth.role}` : auth?.user?.id || auth?.user?.email || auth?.role || 'guest'
}
function read(key, initial) {
  if (!cache.has(key)) {
    let value
    try { value = JSON.parse(sessionStorage.getItem(key) || 'null') } catch { /* Use default when storage is unavailable. */ }
    cache.set(key, value?.version === 1 ? value.data : typeof initial === 'function' ? initial() : initial)
  }
  return cache.get(key)
}
function write(key, value) {
  cache.set(key, value)
  try { sessionStorage.setItem(key, JSON.stringify({ version: 1, data: value })) } catch { /* In-memory drafts still survive navigation. */ }
  listeners.forEach(listener => listener())
}
export function saveDraftField(field, value, scope) {
  write(`auramed:work:${draftScope()}:${scope}:${field}`, value)
}
export function clearPageDraft(path) {
  const prefix = `auramed:work:${draftScope()}:${path}:`
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key)
  } catch { /* Storage may be disabled. */ }
}
export function useDraftState(field, initial, scope) {
  const location = useLocation()
  const key = `auramed:work:${draftScope()}:${scope || location.pathname}:${field}`
  const subscribe = useCallback(listener => { listeners.add(listener); return () => listeners.delete(listener) }, [])
  const snapshot = useCallback(() => read(key, initial), [key])
  const value = useSyncExternalStore(subscribe, snapshot, snapshot)
  const setValue = useCallback(next => write(key, typeof next === 'function' ? next(read(key, initial)) : next), [key])
  return [value, setValue]
}

// Server refreshes update the baseline without replacing unfinished user edits.
export function useServerDraftState(field, initial, scope) {
  const [server, hydrate] = useState(initial)
  const [draft, store] = useDraftState(field, null, scope)
  const value = draft === null ? server : draft
  const set = useCallback(next => store(previous => typeof next === 'function' ? next(previous === null ? server : previous) : next), [store, server])
  const commit = useCallback(saved => { hydrate(saved); store(null) }, [store])
  return [value, set, hydrate, commit]
}
