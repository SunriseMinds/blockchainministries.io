import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/components/ui/use-toast';
import { LogIn, LogOut, LayoutDashboard, Menu, X } from 'lucide-react';
import { PRIMARY_LINKS, authActions, mobileMenuItems } from '@/components/layout/navItems';

/**
 * M12 — the desktop bar is revealed at `lg`, not `md`.
 *
 * At exactly 768px (the old `md` reveal point, and iPad portrait) the full bar
 * needs ~899px, so it overflowed the viewport by ~131px on EVERY page and
 * pushed Login / Join Us / Donate entirely off-screen. Revealing it at `lg`
 * (1024px) means it only ever appears at a width where it actually fits, and
 * everything below that gets the menu button instead.
 */
const Header = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  const handleLogout = async () => {
    setMenuOpen(false);
    const { error } = await signOut();
    if (error) {
      toast({ title: 'Logout Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Signed Out', description: 'You have been securely logged out.' });
      navigate('/');
    }
  };

  // Close on route change, so tapping a destination never leaves the menu open
  // over the page the visitor just asked for (also covers browser Back/Forward,
  // which changes location without any click of ours).
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Escape closes and returns focus to the control that opened it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The panel is an in-flow dropdown rather than a fixed overlay, so there is
  // deliberately NO body scroll-lock to leak: nothing can strand the page in a
  // non-scrollable state if a close is ever missed.

  const navLinkStyle = ({ isActive }) => ({
    color: isActive ? '#FBBF24' : '#BFDBFE',
    textShadow: isActive ? '0 0 5px rgba(251, 191, 36, 0.7)' : 'none',
    position: 'relative',
  });

  const actions = authActions(user);
  const mobile = mobileMenuItems(user);

  const actionButton = (a, { block = false } = {}) => {
    const shared = block ? 'w-full justify-start' : '';
    if (a.action === 'logout') {
      return (
        <Button
          key={a.key}
          onClick={handleLogout}
          variant="ghost"
          size="sm"
          className={`text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center ${shared}`}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {a.label}
        </Button>
      );
    }
    const cls = a.variant === 'primary'
      ? `bg-gradient-to-r from-yellow-400 to-amber-500 text-blue-950 font-bold hover:from-yellow-500 hover:to-amber-600 ${shared}`
      : a.key === 'login'
        ? `border-blue-400/50 text-blue-300 hover:bg-blue-400/10 hover:text-blue-200 ${shared}`
        : `border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200 ${shared}`;
    return (
      <Button key={a.key} asChild variant={a.variant === 'primary' ? 'default' : 'outline'} size="sm" className={cls}>
        <Link to={a.to} className="flex items-center">
          {a.key === 'login' && <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />}
          {a.key === 'dashboard' && <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />}
          {a.label}
        </Link>
      </Button>
    );
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="bg-blue-950/50 backdrop-blur-lg text-white p-4 sticky top-0 z-50 border-b border-yellow-400/20"
    >
      <nav className="container mx-auto flex justify-between items-center" aria-label="Main navigation">
        <Link to="/" className="flex items-center space-x-3 group min-w-0">
          <svg className="w-9 h-9 shrink-0 text-yellow-400 group-hover:text-yellow-300 transition-all duration-300 group-hover:scale-110" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="3" fill="none" />
            <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="3" fill="none" />
          </svg>
          <span className="font-bold text-xl text-yellow-300 group-hover:text-yellow-200 transition-colors truncate">Blockchain Ministries</span>
        </Link>

        {/* Desktop bar — revealed only at lg, where it actually fits. */}
        <div className="hidden lg:flex space-x-4 items-center font-light text-blue-200">
          {PRIMARY_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">
              {l.label}
            </NavLink>
          ))}
          <div className="flex items-center gap-2 pl-2">
            {actions.map((a) => actionButton(a))}
          </div>
        </div>

        {/* Menu control — everything below lg. */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="lg:hidden p-2 rounded-lg bg-yellow-400/15 text-yellow-300 hover:bg-yellow-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 transition-colors"
        >
          {menuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
        </button>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden overflow-hidden border-t border-yellow-400/20 mt-4 -mx-4 px-4"
          >
            <ul className="py-4 space-y-1">
              {mobile.links.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    end={l.end}
                    onClick={() => setMenuOpen(false)}
                    style={navLinkStyle}
                    className="block px-3 py-3 rounded-lg hover:bg-yellow-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 pb-4 border-t border-yellow-400/10 pt-4">
              {mobile.actions.map((a) => actionButton(a, { block: true }))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Header;
