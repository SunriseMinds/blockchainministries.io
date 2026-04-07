import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/components/ui/use-toast';
import { LogIn, LogOut, LayoutDashboard } from 'lucide-react';

const Header = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed Out",
        description: "You have been securely logged out.",
      });
      navigate('/');
    }
  };

  const navLinkStyle = ({ isActive }) => {
    return {
      color: isActive ? '#FBBF24' : '#BFDBFE',
      textShadow: isActive ? '0 0 5px rgba(251, 191, 36, 0.7)' : 'none',
      position: 'relative'
    };
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="bg-blue-950/50 backdrop-blur-lg text-white p-4 sticky top-0 z-50 border-b border-yellow-400/20"
    >
      <nav className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-3 group">
           <svg className="w-9 h-9 text-yellow-400 group-hover:text-yellow-300 transition-all duration-300 group-hover:scale-110" viewBox="0 0 100 100" aria-hidden="true">
             <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="3" fill="none" />
             <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="3" fill="none" />
           </svg>
          <span className="font-bold text-xl text-yellow-300 group-hover:text-yellow-200 transition-colors">Blockchain Ministries</span>
        </Link>
        <div className="hidden md:flex space-x-4 items-center font-light text-blue-200">
            <NavLink to="/" style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">Home</NavLink>
            <NavLink to="/about" style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">About</NavLink>
            <NavLink to="/ministries" style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">Ministries</NavLink>
            <NavLink to="/scrolls" style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">Scrolls</NavLink>
            <NavLink to="/token" style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">Token</NavLink>
            <NavLink to="/contact" style={navLinkStyle} className="hover:text-yellow-300 transition-colors duration-300 px-2">Contact</NavLink>
            <div className="flex items-center gap-2 pl-2">
              {user ? (
                <>
                  <Button asChild variant="outline" size="sm" className="border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200">
                    <Link to="/dashboard" className="flex items-center">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </Button>
                  <Button onClick={handleLogout} variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="outline" size="sm" className="border-blue-400/50 text-blue-300 hover:bg-blue-400/10 hover:text-blue-200">
                      <Link to="/login" className="flex items-center">
                        <LogIn className="mr-2 h-4 w-4" />
                        Login
                      </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200">
                      <Link to="/join">Join Us</Link>
                  </Button>
                  <Button asChild size="sm" className="bg-gradient-to-r from-yellow-400 to-amber-500 text-blue-950 font-bold hover:from-yellow-500 hover:to-amber-600">
                      <Link to="/donate">Donate</Link>
                  </Button>
                </>
              )}
            </div>
        </div>
      </nav>
    </motion.header>
  );
};

export default Header;