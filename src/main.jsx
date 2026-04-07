import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';
import { AuthProvider } from '@/contexts/AuthProvider';
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

const initialOptions = {
    "client-id": "test",
    currency: "USD",
    intent: "capture",
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PayPalScriptProvider options={initialOptions}>
          <App />
        </PayPalScriptProvider>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);