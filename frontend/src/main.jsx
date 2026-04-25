import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderFatalError(message) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="padding:16px;font-family:Segoe UI,Tahoma,sans-serif;color:#111827;">
      <h2 style="margin:0 0 8px;">Le frontend a plante</h2>
      <p style="margin:0 0 8px;">${escapeHtml(message)}</p>
      <p style="margin:0;">Ouvre la console navigateur (F12) pour le detail.</p>
    </div>
  `
}

window.addEventListener('error', (event) => {
  const msg = event?.error?.message || event?.message || 'Erreur frontend inconnue.'
  console.error('Global error:', event?.error || event)
  renderFatalError(msg)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason
  const msg = reason?.message || String(reason || 'Promesse non geree.')
  console.error('Unhandled promise rejection:', reason)
  renderFatalError(msg)
})

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Erreur frontend inconnue.' }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Frontend runtime error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'Segoe UI, sans-serif' }}>
          <h2>Le frontend a plante</h2>
          <p>{this.state.message}</p>
          <p>Ouvrez la console navigateur (F12) pour les details techniques.</p>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
const root = createRoot(rootEl)

import('./App.jsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
  .catch((err) => {
    console.error('Failed to load App module:', err)
    renderFatalError(err?.message || 'Chargement App impossible.')
  })
