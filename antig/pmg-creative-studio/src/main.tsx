import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@agencypmg/alli-design-system/lib/alli.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
