import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import ProtectedRoute from '../components/auth/ProtectedRoute.jsx';
import { useAuth } from '../contexts/SupabaseAuthContext';
import { useSupabase } from '../hooks/useSupabase';
import { useToast } from '../components/ui/use-toast';

const Settings = () => {
  const { user } = useAuth();
  const supabase = useSupabase();
  const { toast } = useToast();

  const [profile, setProfile] = useState({
    full_name: '',
    wallet_address: '',
    preferences: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        setProfile({
          full_name: user.user_metadata?.full_name || '',
          wallet_address: user.user_metadata?.wallet_address || '',
          preferences: user.user_metadata?.preferences || '',
        });
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
const { error } = await supabase.auth.updateUser({
        data: {
          full_name: profile.full_name,
          wallet_address: profile.wallet_address,
          preferences: profile.preferences,
        },
      });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error saving profile',
        description: error.message,
      });
    } else {
      toast({
        title: 'Profile updated',
        description: 'Your settings have been saved successfully.',
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-black text-yellow-400 text-center p-8 min-h-screen flex items-center justify-center text-2xl font-serif">
        Loading your settings...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-6">User Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="full_name" className="block font-semibold mb-1">
            Display Name
          </label>
          <input
            type="text"
            id="full_name"
            name="full_name"
            value={profile.full_name}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
            required
          />
        </div>
        <div>
          <label htmlFor="wallet_address" className="block font-semibold mb-1">
            Wallet Address
          </label>
          <input
            type="text"
            id="wallet_address"
            name="wallet_address"
            value={profile.wallet_address}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="preferences" className="block font-semibold mb-1">
            Preferences (JSON)
          </label>
          <textarea
            id="preferences"
            name="preferences"
            value={profile.preferences}
            onChange={handleChange}
            rows={5}
            className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
            placeholder='e.g. {"theme":"dark","notifications":true}'
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
};

const SettingsPage = () => {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <Settings />
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default SettingsPage;
