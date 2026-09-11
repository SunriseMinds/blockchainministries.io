import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Shield, Settings } from 'lucide-react';
import { Toaster } from "@/components/ui/toaster";
import { cn } from '@/lib/utils';

const DashboardLayout = () => {
  // The session already carries role/display_name (read from the canonical
  // `users` table server-side, see AuthProvider's toProfile()) — no separate
  // profile fetch needed.
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

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
        {/* The header row WRAPS instead of overflowing.
            `header p-4` and Tailwind's `container` (padding: 2rem, see
            tailwind.config.js) together spend 96px of horizontal room before
            any content, leaving 224px at 320px wide. The brand (138px) and the
            action group (213px) are 351px of rigid content — both were flex
            items with the default `min-width: auto`, so neither could shrink
            and the group escaped to a fixed right edge of 399px. That is the
            whole of the old 9px overflow at 390 and 79px at 320.
            Wrapping puts them on separate lines; `min-w-0` + `truncate` lets
            the brand give way rather than push. Nothing is hidden to achieve
            this, and no axis is clipped. */}
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <Link to={isAdmin ? "/admin" : "/dashboard"} className="flex min-w-0 items-center space-x-3 group">
            <LayoutDashboard className="w-8 h-8 shrink-0 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
            <span className="min-w-0 truncate font-bold text-xl text-yellow-300 group-hover:text-yellow-200 transition-colors">
              {isAdmin ? 'Admin Sanctuary' : 'Minister Dashboard'}
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {isAdmin && (
              <Button asChild variant="ghost" size="sm" className="text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300">
                <Link to="/dashboard">
                  <Shield className="w-4 h-4 mr-2" />
                  Member View
                </Link>
              </Button>
            )}
            {/* Was `hidden sm:inline-flex` — unreachable below 640px, which is
                where most members actually are. Now it wraps like everything
                else instead of disappearing. */}
            {/* min-h-9 matches the 36px height of the buttons beside it: as a
                desktop-only text link it was a 20px-tall target, which is too
                thin for a thumb now that it is reachable on phones. */}
            <Button asChild variant="link" size="sm" className="text-yellow-300 hover:text-yellow-200 p-0 h-auto min-h-9">
              <a href={trustlineUrl} target="_blank" rel="noopener noreferrer">
                Set EFT TrustLine
              </a>
            </Button>
            {/* Identity text only; the role itself is always stated by the
                heading beside it ("Admin Sanctuary" / "Minister Dashboard"),
                so at phone widths this yields the room rather than wrapping a
                long email onto a line of its own. */}
            <span className="hidden max-w-[14rem] truncate text-sm text-blue-300 sm:block">Welcome, {profile?.display_name || user?.email}</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      
      {isAdmin && (
        <nav className="bg-black/20 border-b border-yellow-400/10">
          {/* Same reasoning as the header row: two rigid links plus the
              container's 2rem padding exceed 320px, so this wraps too. */}
          <div className="container mx-auto flex flex-wrap items-center gap-2 p-2">
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