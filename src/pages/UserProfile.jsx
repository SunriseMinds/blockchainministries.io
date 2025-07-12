import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import ProtectedRoute from '../components/auth/ProtectedRoute.jsx';
import { useAuth } from '../contexts/SupabaseAuthContext';
import { useSupabase } from '../hooks/useSupabase';

const UserProfile = () => {
  const { session, user } = useAuth();
  const supabase = useSupabase();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        setLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email, wallet_address, role')
          .eq('id', user.id)
          .single();
        if (error) {
          console.error('Error fetching profile:', error);
          setProfile(null);
        } else {
          setProfile(data);
        }
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user, supabase]);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-black text-yellow-400 text-center p-8 min-h-screen flex items-center justify-center text-2xl font-serif">
        Loading your profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 text-center text-red-600">
        Unable to load profile information.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-6">Your Profile</h1>
      <div className="mb-4">
        <strong>Name:</strong> {profile.full_name || 'N/A'}
      </div>
      <div className="mb-4">
        <strong>Email:</strong> {profile.email || 'N/A'}
      </div>
      <div className="mb-4">
        <strong>Wallet Address:</strong> {profile.wallet_address || 'N/A'}
      </div>
      <div className="mb-4">
        <strong>Role:</strong> {profile.role || 'N/A'}
      </div>
    </div>
  );
};

const UserProfilePage = () => {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <UserProfile />
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default UserProfilePage;
