import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const APP_STYLESHEET = fileURLToPath(new URL('../../css/styles.css', import.meta.url))
const VIRTUAL_ID = 'virtual:app-tokens.css'

/**
 * Lifts only the design-token blocks out of the app's stylesheet: `:root`,
 * `.dark-theme`, and the `[data-palette]` variants. A block qualifies when
 * every declaration in it is a custom property, so the map inherits the
 * app's colours, fonts, and all of its themes without a single duplicated
 * value, and without the app's component rules leaking onto the map.
 */
function appTokens(): Plugin {
  const resolved = '\0' + VIRTUAL_ID
  const extract = () => {
    const css = readFileSync(APP_STYLESHEET, 'utf8')
    const blocks: string[] = []
    const rule = /([^{}]+)\{([^{}]*)\}/g
    for (const [, selector, body] of css.matchAll(rule)) {
      const declarations = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
      if (declarations.length > 0 && declarations.every((d) => d.startsWith('--'))) {
        blocks.push(`${selector.trim()} {\n  ${declarations.join(';\n  ')};\n}`)
      }
    }
    return blocks.join('\n\n') + '\n'
  }
  return {
    name: 'whisper-transcribe-app-tokens',
    resolveId: (id) => (id === VIRTUAL_ID ? resolved : null),
    load: (id) => (id === resolved ? extract() : null),
    configureServer(server) {
      server.watcher.add(APP_STYLESHEET)
      server.watcher.on('change', (path) => {
        if (path === APP_STYLESHEET) {
          const mod = server.moduleGraph.getModuleById(resolved)
          if (mod) server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), appTokens()],
  build: { outDir: 'dist', emptyOutDir: true },
})
