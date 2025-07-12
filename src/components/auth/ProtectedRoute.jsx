import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';

/**
 * ProtectedRoute restricts access to admin users only.
 * It shows a loading screen while verifying the current session
 * and the user's role. Non-admin users are redirected away.
 */
const ProtectedRoute = ({ children }) => {
  const { session, user, loading: authLoading } = useAuth();
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const fetchRole = async () => {
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setRole(data?.role ?? null);
      }
      setRoleLoading(false);
    };

    if (!authLoading) {
      fetchRole();
    }
  }, [user, authLoading]);

  const loading = authLoading || roleLoading;

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

  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
