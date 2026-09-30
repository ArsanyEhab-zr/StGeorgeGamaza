import React from 'react'
import ReactDOM from 'react-dom/client'
// 🌟 استخدمنا HashRouter عشان زرار الرجوع في الموبايل ميعملش شاشة بيضا
import { HashRouter as Router } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// 🌟 Cache-busting: Purge old Koinonia settings if present
const savedSettings = localStorage.getItem('appSettings');
if (savedSettings && savedSettings.includes("كينونيا")) {
    console.warn("Purging old Koinonia settings from cache...");
    localStorage.removeItem('appSettings');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)