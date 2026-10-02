'use client'

import { useState } from 'react'

/**
 * A value kept in this browser as JSON; storage that throws keeps it in memory.
 * Read in the initializer: the app renders only in the browser (app/_apex.tsx).
 */
export function useKept<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* kept for this page only */
    }
  }
  return [value, set]
}
