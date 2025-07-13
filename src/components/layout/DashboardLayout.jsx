import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSupabase } from '@/hooks/useSupabase';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Shield } from 'lucide-react';
import { Toaster } from "@/components/ui/toaster";

const DashboardLayout = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

  useEffect(() => {
    if (user) {
const supabase = useSupabase();
const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        if (data) {
          setProfile(data);
        }
      };
      fetchProfile();
    }
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-[#0A192F] to-black font-sans text-white">
      <header className="bg-blue-950/50 backdrop-blur-lg p-4 sticky top-0 z-50 border-b border-yellow-400/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <Link to="/dashboard" className="flex items-center space-x-3 group">
            <LayoutDashboard className="w-8 h-8 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
            <span className="font-bold text-xl text-yellow-300 group-hover:text-yellow-200 transition-colors">
              Minister Dashboard
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {profile?.role === 'admin' && (
              <Button asChild variant="ghost" size="sm" className="text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300">
                <Link to="/admin/dashboard">
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </Link>
              </Button>
            )}
            <Button asChild variant="link" size="sm" className="text-yellow-300 hover:text-yellow-200 p-0 h-auto hidden sm:inline-flex">
              <a href={trustlineUrl} target="_blank" rel="noopener noreferrer">
                Set EFT TrustLine
              </a>
            </Button>
            <span className="text-sm text-blue-300 hidden sm:block">Welcome, {profile?.full_name || user?.email}</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
};

export default DashboardLayout;
