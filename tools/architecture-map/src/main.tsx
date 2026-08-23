import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'virtual:app-tokens.css'
import './architecture/components/keyframes.css'
import './page.css'
import ArchitectureMap from './architecture/components/ArchitectureMap'
import { ARCHITECTURE } from './architecture/graph'
import { ThemeControls } from './ThemeControls'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeControls />
    <ArchitectureMap data={ARCHITECTURE} />
  </StrictMode>,
)
