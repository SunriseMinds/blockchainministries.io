import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Shield, Settings } from 'lucide-react';
import { Toaster } from "@/components/ui/toaster";
import { cn } from '@/lib/utils';

const DashboardLayout = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

  useEffect(() => {
    if (user) {
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

  const isAdmin = profile?.role === 'admin';
  const adminNavLinks = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Management', href: '/admin/management', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-[#0A192F] to-black font-sans text-white">
      <header className="bg-blue-950/50 backdrop-blur-lg p-4 sticky top-0 z-50 border-b border-yellow-400/20">
        <div className="container mx-auto flex justify-between items-center">
          <Link to={isAdmin ? "/admin" : "/dashboard"} className="flex items-center space-x-3 group">
            <LayoutDashboard className="w-8 h-8 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
            <span className="font-bold text-xl text-yellow-300 group-hover:text-yellow-200 transition-colors">
              {isAdmin ? 'Admin Sanctuary' : 'Minister Dashboard'}
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Button asChild variant="ghost" size="sm" className="text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300">
                <Link to="/dashboard">
                  <Shield className="w-4 h-4 mr-2" />
                  Member View
                </Link>
              </Button>
            )}
            <Button asChild variant="link" size="sm" className="text-yellow-300 hover:text-yellow-200 p-0 h-auto hidden sm:inline-flex">
              <a href={trustlineUrl} target="_blank" rel="noopener noreferrer">
                Set EFT TrustLine
              </a>
            </Button>
            <span className="text-sm text-blue-300 hidden sm:block">Welcome, {profile?.display_name || user?.email}</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      
      {isAdmin && (
        <nav className="bg-black/20 border-b border-yellow-400/10">
          <div className="container mx-auto flex items-center gap-4 p-2">
            {adminNavLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location.pathname === link.href
                    ? "bg-yellow-400/10 text-yellow-300"
                    : "text-blue-200 hover:bg-blue-900/50 hover:text-white"
                )}
              >
                <link.icon className="w-4 h-4" />
                {link.name}
              </Link>
            ))}
          </div>
        </nav>
      )}

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
};

export default DashboardLayout;