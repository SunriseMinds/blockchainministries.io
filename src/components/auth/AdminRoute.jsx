import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';

const AdminRoute = ({ children }) => {
  // The session response already carries `role` (read from the canonical
  // `users` table server-side) — no separate profile fetch needed.
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-black text-yellow-400 text-center p-8 min-h-screen flex items-center justify-center text-2xl font-serif">
        Verifying Elder Credentials...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default AdminRoute;