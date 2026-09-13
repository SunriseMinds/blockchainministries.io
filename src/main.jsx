import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';
import { AuthProvider } from '@/contexts/AuthProvider';

// M14.1 — the PayPalScriptProvider that used to wrap the whole app is gone.
// It carried a literal `"client-id": "test"` and pulled PayPal's third-party
// SDK into EVERY page of the site, including admin and verify, for a payment
// method that had no backend at all.
//
// M14.5 brought PayPal back as a real rail, and deliberately did NOT bring
// this back with it: the SDK is now loaded lazily inside
// src/pages/Donate/components/PayPalGive.jsx, only on Donate, and only when
// PayPal is actually configured. The sitewide load was the defect; it stays
// gone.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);