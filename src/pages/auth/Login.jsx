import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthProvider';
import { USE_CLOUDFLARE_API } from '@/lib/cloudflareApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { KeyRound, AtSign, LogIn, Mail, CheckCircle } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, requestLoginLink } = useAuth();
  const { toast } = useToast();
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (USE_CLOUDFLARE_API) {
      // M9.8: passwordless. This only requests the link — the session is
      // established later, when the user explicitly confirms via the
      // emailed link (see LoginVerify.jsx), never here.
      const { error } = await requestLoginLink(email);
      if (error) {
        toast({ title: "Request Failed", description: error.message || "Could not send a login link. Please try again.", variant: "destructive" });
      } else {
        setLinkSent(true);
      }
      setLoading(false);
      return;
    }

    const { error } = await signIn({ email, password });
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

  if (linkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-8 max-w-md"
        >
          <CheckCircle className="w-20 h-20 mx-auto text-green-400 mb-6" />
          <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-4">Check Your Email</h1>
          <p className="text-blue-200">
            If <span className="font-bold">{email}</span> has an account, a login link is on its way. Open it and confirm to sign in — the link expires in 15 minutes.
          </p>
          <Button onClick={() => setLinkSent(false)} variant="link" className="mt-6 text-yellow-400">
            Use a different email
          </Button>
        </motion.div>
      </div>
    );
  }

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
                {USE_CLOUDFLARE_API ? (
                  <p className="text-xs text-blue-300/70">
                    No password needed — we'll email you a link to log in.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-blue-300 flex items-center"><KeyRound className="w-4 h-4 mr-2"/>Password</Label>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="Enter your sacred key" />
                    </div>
                    <div className="text-right">
                      <Link to="/forgot-password" className="text-sm text-blue-300 hover:text-yellow-400 transition-colors">Forgot Password?</Link>
                    </div>
                  </>
                )}
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500">
                  {loading ? 'Please wait...' : (USE_CLOUDFLARE_API ? 'Send Login Link' : 'Login')}
                  {USE_CLOUDFLARE_API ? <Mail className="ml-2 h-4 w-4"/> : <LogIn className="ml-2 h-4 w-4"/>}
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
                  <Link to="/join" className="font-bold text-yellow-400 hover:text-yellow-300">
                    Join Now
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
