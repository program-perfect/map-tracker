"use client"

import { useLayoutEffect, useRef } from "react"
import { useStore } from "@/lib/store"

export function DefaultLightTheme() {
  const initializedRef = useRef(false)
  const { theme, toggleTheme } = useStore()

  useLayoutEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    if (theme === "dark") {
      toggleTheme()
    }
  }, [theme, toggleTheme])

  return null
}
