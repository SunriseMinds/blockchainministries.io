import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { api, USE_CLOUDFLARE_API } from '@/lib/cloudflareApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/**
 * Handles the /verify-email?token=... link from the signup confirmation email.
 *
 * Cloudflare path: POSTs the token to /api/auth/verify-email (single-use,
 * hash-checked against D1). Token is never logged or stored in component state.
 *
 * Supabase path: Supabase's own redirect handles confirmation; this page is
 * not in that flow so we show an informational message.
 */
const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!USE_CLOUDFLARE_API) {
      // Supabase confirmation happens server-side via Supabase's own redirect;
      // the /verify-email path is only used in the Cloudflare worker auth flow.
      setStatus('error');
      setErrorMsg('Email verification is managed by the authentication provider in this mode.');
      return;
    }

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg('This verification link is missing a token. Please use the link from your email.');
      return;
    }

    // Token is passed directly to the API and never stored in state.
    api.post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        // Surface the server message (already generic) or a safe fallback.
        setErrorMsg(err.message || 'This verification link is invalid or has expired.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — token is a one-time URL param

  return (
    <>
      <Helmet>
        <title>Verify Email | Blockchain Ministries</title>
        <meta name="description" content="Confirm your email address for your Blockchain Ministries account." />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="w-full max-w-md bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
            <CardHeader className="text-center">
              {status === 'verifying' && (
                <>
                  <Loader2 className="mx-auto mb-2 h-10 w-10 text-yellow-400 animate-spin" />
                  <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Verifying…</CardTitle>
                  <CardDescription className="text-yellow-200/80">Confirming your email address.</CardDescription>
                </>
              )}
              {status === 'success' && (
                <>
                  <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-400" />
                  <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Email Verified</CardTitle>
                  <CardDescription className="text-yellow-200/80">
                    Your address has been confirmed. You may now sign in.
                  </CardDescription>
                </>
              )}
              {status === 'error' && (
                <>
                  <XCircle className="mx-auto mb-2 h-10 w-10 text-red-400" />
                  <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Verification Failed</CardTitle>
                  <CardDescription className="text-yellow-200/80">
                    {errorMsg || 'The link is invalid or has expired.'}
                  </CardDescription>
                </>
              )}
            </CardHeader>
            {(status === 'success' || status === 'error') && (
              <CardContent className="text-center pt-2">
                <Button
                  asChild
                  className="bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500"
                >
                  <Link to="/login">Go to Login</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default VerifyEmail;
