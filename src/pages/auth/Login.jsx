import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { KeyRound, AtSign, LogIn } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({
        title: "Authentication Failed",
        description: error.message || "The credentials provided are not recognized in the sacred archives.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Authentication Successful",
        description: "Welcome back, Minister of Light.",
      });
      navigate(from, { replace: true });
    }
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Minister Login | Blockchain Ministries</title>
        <meta name="description" content="Authenticate to access the Minister Dashboard." />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="w-full max-w-md bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
            <CardHeader className="text-center">
              <Link to="/" className="inline-block">
                <svg className="w-16 h-16 mx-auto text-yellow-400 mb-4 hover:text-yellow-300 transition-colors" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </Link>
              <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Minister Portal</CardTitle>
              <CardDescription className="text-yellow-200/80">Welcome back. Please authenticate.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-blue-300 flex items-center"><AtSign className="w-4 h-4 mr-2"/>Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="minister@domain.org" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-blue-300 flex items-center"><KeyRound className="w-4 h-4 mr-2"/>Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="Enter your sacred key" />
                </div>
                <div className="text-right">
                  <Link to="/forgot-password" className="text-sm text-blue-300 hover:text-yellow-400 transition-colors">Forgot Password?</Link>
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500">
                  {loading ? 'Authenticating...' : 'Login'}
                  <LogIn className="ml-2 h-4 w-4"/>
                </Button>
              </form>
              <div className="mt-6 text-center space-y-4">
                <p className="text-sm text-blue-300">
                  Want to hold EFT?{' '}
                  <a href={trustlineUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-yellow-400 hover:text-yellow-300 underline">
                    Set your TrustLine
                  </a>
                </p>
                <p className="text-sm text-blue-300">
                  Don't have a covenant?{' '}
                  <Link to="/signup" className="font-bold text-yellow-400 hover:text-yellow-300">
                    Sign Up
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Login;