import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, XCircle, Loader2 } from 'lucide-react';

/**
 * Handles the /login/verify?token=... link from a magic-link login email.
 *
 * SECURITY: this page must NEVER consume the token automatically on load —
 * corporate mail-security scanners routinely pre-fetch links found in
 * emails, which would silently burn a one-time login token before the real
 * user ever sees this page (see M9.7/M9.8). Consumption only happens after
 * an explicit "Confirm Login" click.
 */
const LoginVerify = () => {
  const [searchParams] = useSearchParams();
  const { consumeLoginLink } = useAuth();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState(token ? 'idle' : 'error'); // 'idle' | 'consuming' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState(token ? '' : 'This login link is missing a token. Please use the link from your email.');

  const handleConfirm = async () => {
    setStatus('consuming');
    const { error } = await consumeLoginLink(token);
    if (error) {
      setStatus('error');
      setErrorMsg(error.message || 'This login link is invalid or has expired.');
      return;
    }
    setStatus('success');
    navigate('/dashboard', { replace: true });
  };

  return (
    <>
      <Helmet>
        <title>Confirm Login | Blockchain Ministries</title>
        <meta name="description" content="Confirm your login to Blockchain Ministries." />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="w-full max-w-md bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
            <CardHeader className="text-center">
              {status === 'idle' && (
                <>
                  <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-yellow-400" />
                  <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Confirm Login</CardTitle>
                  <CardDescription className="text-yellow-200/80">
                    Click below to complete signing in.
                  </CardDescription>
                </>
              )}
              {status === 'consuming' && (
                <>
                  <Loader2 className="mx-auto mb-2 h-10 w-10 text-yellow-400 animate-spin" />
                  <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Signing In…</CardTitle>
                </>
              )}
              {status === 'error' && (
                <>
                  <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
                  <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Login Failed</CardTitle>
                  <CardDescription className="text-yellow-200/80">
                    {errorMsg}
                  </CardDescription>
                </>
              )}
            </CardHeader>
            <CardContent className="text-center pt-2">
              {status === 'idle' && (
                <Button
                  onClick={handleConfirm}
                  className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500"
                >
                  Confirm Login
                </Button>
              )}
              {status === 'error' && (
                <Button
                  asChild
                  className="bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500"
                >
                  <Link to="/login">Request a New Link</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default LoginVerify;
