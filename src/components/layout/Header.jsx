import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/components/ui/use-toast';
import {
  LogIn,
  LogOut,
  LayoutDashboard,
  ArrowRight,
  Bell as NotificationIcon,
} from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import NotificationsPanel from '@/components/dashboard/NotificationsPanel';

const Header = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const supabase = useSupabase();

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!error && data) {
        setNotifications(data);
      }
    };

    fetchNotifications();
  }, [supabase]);

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: 'Logout Failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Signed Out',
        description: 'You have been securely logged out.',
      });
      navigate('/');
    }
  };

  const navLinkStyle = ({ isActive }) => ({
    color: isActive ? '#FFD700' : '#BFDFE',
    textShadow: isActive ? '0 0 8px #FFD700' : 'none',
    position: 'relative',
  });

  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-gradient-to-br from-[#0B1426] via-[#1E3A8A] to-[#4C1D95] text-white p-4 sticky top-0 z-50 border-b border-yellow-400/20 shadow-glow"
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-3 group">
            <svg
              className="h-8 w-8 text-[#FFD700] drop-shadow-glow"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Gold Sacred Geometry Symbol"
            >
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                d="M50 5 L95 50 L50 95 L5 50 Z"
                fill="currentColor"
                opacity="0.3"
              />
              <circle
                cx="50"
                cy="50"
                r="25"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <path
                d="M50 20 L80 50 L50 80 L20 50 Z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
            <span className="font-serif font-bold text-xl text-[#FFD700] drop-shadow-glow group-hover:text-yellow-300 transition-colors">
              Blockchain Ministries
            </span>
          </Link>

          {/* Menu Toggle Button for Mobile */}
          <div
            id="menu-toggle"
            className="menu-toggle md:hidden cursor-pointer text-2xl text-[#FFD700]"
            aria-label="Toggle menu"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setMenuOpen(!menuOpen);
              }
            }}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ☰
          </div>

          {/* Nav List */}
          <ul
            id="nav-list"
            className={`navbar ${menuOpen ? 'show' : ''} md:flex space-x-6 items-center font-light font-serif text-[#FFD700]`}
          >
            <NavLink
              to="/"
              style={navLinkStyle}
              className="hover:text-yellow-300 transition-colors duration-300 px-2"
              onClick={() => setMenuOpen(false)}
            >
              Home
            </NavLink>
            <NavLink
              to="/about"
              style={navLinkStyle}
              className="hover:text-yellow-300 transition-colors duration-300 px-2"
              onClick={() => setMenuOpen(false)}
            >
              About
            </NavLink>
            <NavLink
              to="/ministries"
              style={navLinkStyle}
              className="hover:text-yellow-300 transition-colors duration-300 px-2"
              onClick={() => setMenuOpen(false)}
            >
              Ministries
            </NavLink>
            <NavLink
              to="/scrolls"
              style={navLinkStyle}
              className="hover:text-yellow-300 transition-colors duration-300 px-2"
              onClick={() => setMenuOpen(false)}
            >
              Scrolls
            </NavLink>
            <NavLink
              to="/token"
              style={navLinkStyle}
              className="hover:text-yellow-300 transition-colors duration-300 px-2"
              onClick={() => setMenuOpen(false)}
            >
              Token
            </NavLink>
            <NavLink
              to="/contact"
              style={navLinkStyle}
              className="hover:text-yellow-300 transition-colors duration-300 px-2"
              onClick={() => setMenuOpen(false)}
            >
              Contact
            </NavLink>

            <div className="flex items-center gap-4 pl-4">
              <NotificationIcon
                className="h-5 w-5 cursor-pointer text-[#FFD700] hover:text-yellow-300 drop-shadow-glow transition-colors"
                onClick={() => setShowNotifications((v) => !v)}
              />

              {user ? (
                <>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-[#FFD700]/50 text-[#FFD700] hover:bg-yellow-500/10 drop-shadow-glow"
                  >
                    <Link to="/dashboard" className="flex items-center">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </Button>
                  <Button
                    onClick={handleLogout}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:bg-red-500/20"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="flex items-center text-[#FFD700] hover:text-yellow-300 drop-shadow-glow transition-colors duration-300"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Login
                  </Link>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-[#FFD700] border-[#FFD700] hover:bg-yellow-500/20 drop-shadow-glow"
                  >
                    <Link to="/login" className="flex items-center">
                      Login <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#FFD700] text-blue-950 font-bold px-4 py-1 rounded-md drop-shadow-glow hover:brightness-110 transition-all"
                  >
                    <Link to="/join">Join Us</Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="bg-gradient-to-r from-yellow-400 to-amber-500 text-blue-950 font-bold px-4 py-1 rounded-md drop-shadow-glow hover:brightness-110 transition-all"
                  >
                    <Link to="/donate">Donate</Link>
                  </Button>
                </>
              )}
            </div>
          </ul>
        </nav>
      </motion.header>

      {showNotifications && (
        <NotificationsPanel notifications={notifications} />
      )}
    </>
  );
};

export default Header;
