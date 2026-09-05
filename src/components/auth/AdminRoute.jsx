import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/customSupabaseClient';
import { USE_CLOUDFLARE_API } from '@/lib/cloudflareApi';

const AdminRoute = ({ children }) => {
  // The Cloudflare session response already carries `role` (read from the
  // canonical `users` table server-side) — no separate profile fetch needed,
  // and definitely no direct Supabase query in this path.
  const { session, user, profile: cloudflareProfile, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (USE_CLOUDFLARE_API) {
      setProfile(cloudflareProfile);
      setProfileLoading(false);
      return;
    }
    if (user) {
      const fetchProfile = async () => {
        setProfileLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (data) {
          setProfile(data);
        }
        setProfileLoading(false);
      };
      fetchProfile();
    } else if (!authLoading) {
      setProfileLoading(false);
    }
  }, [user, authLoading, cloudflareProfile]);

  const loading = authLoading || profileLoading;

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