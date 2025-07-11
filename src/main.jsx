import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';
import { AuthProvider } from '@/contexts/AuthProvider';

/**
 * Entry point of the React application.
 * Sets up routing, authentication context, and UI notifications.
 */
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
