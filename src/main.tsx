import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { bootstrapAdminAppRoute } from './lib/adminAppBootstrap.ts'
import { AuthProvider } from './context/AuthContext.tsx'
import App from './App.tsx'

bootstrapAdminAppRoute()

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    /* optional — subscribe flow also registers */
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
