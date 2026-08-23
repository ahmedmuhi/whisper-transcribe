import { useState } from 'react'

const PALETTES = ['coastal', 'organic', 'industry', 'broadsheet'] as const
type Palette = (typeof PALETTES)[number]

/**
 * The same two switches the app has: light or dark, and which palette. They
 * set the same class and attribute on <html> that the app sets, which is all
 * the tokens need to re-theme the map.
 */
export function ThemeControls() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark-theme'))
  const [palette, setPalette] = useState<Palette>(
    () => (document.documentElement.getAttribute('data-palette') as Palette | null) ?? 'coastal',
  )

  function toggleDark() {
    const next = !dark
    document.documentElement.classList.toggle('dark-theme', next)
    localStorage.setItem('architecture-map-theme', next ? 'dark' : 'light')
    setDark(next)
  }

  function choosePalette(next: Palette) {
    if (next === 'coastal') {
      document.documentElement.removeAttribute('data-palette')
      localStorage.removeItem('architecture-map-palette')
    } else {
      document.documentElement.setAttribute('data-palette', next)
      localStorage.setItem('architecture-map-palette', next)
    }
    setPalette(next)
  }

  return (
    <div className="am-theme-controls" aria-label="Map theme">
      <select value={palette} onChange={(e) => choosePalette(e.target.value as Palette)} aria-label="Palette">
        {PALETTES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button type="button" onClick={toggleDark} aria-pressed={dark}>
        {dark ? 'dark' : 'light'}
      </button>
    </div>
  )
}
