import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, FileText, Award } from 'lucide-react';

const Verify = () => {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const verifySlug = async () => {
      if (!slug) {
        setError('No verification code provided.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Check ordinations first
        let { data: ordinationData, error: ordinationError } = await supabase
          .from('ordinations')
          .select('*, profiles(display_name)')
          .eq('verify_slug', slug)
          .eq('status', 'approved')
          .single();

        if (ordinationData) {
          setVerificationResult({ type: 'Ordination', data: ordinationData });
          setLoading(false);
          return;
        }
        if (ordinationError && ordinationError.code !== 'PGRST116') throw ordinationError;

        // Check scrolls next
        let { data: scrollData, error: scrollError } = await supabase
          .from('scrolls')
          .select('*')
          .eq('verify_slug', slug)
          .single();

        if (scrollData) {
          setVerificationResult({ type: 'Scroll', data: scrollData });
          setLoading(false);
          return;
        }
        if (scrollError && scrollError.code !== 'PGRST116') throw scrollError;

        setError('Verification code is invalid or has expired.');
      } catch (e) {
        console.error('Verification error:', e);
        setError('An unexpected error occurred during verification.');
      } finally {
        setLoading(false);
      }
    };

    verifySlug();
  }, [slug]);

  const renderResult = () => {
    if (!verificationResult) return null;

    const { type, data } = verificationResult;

    if (type === 'Ordination') {
      return (
        <>
          <Award className="w-16 h-16 mx-auto text-yellow-400 mb-4" />
          <CardTitle className="text-2xl text-yellow-300 sacred-font">Ordination Credential Verified</CardTitle>
          <CardContent className="mt-6 text-blue-200 space-y-2">
            <p><strong className="text-yellow-400">Minister:</strong> {data.profiles.display_name}</p>
            <p><strong className="text-yellow-400">Status:</strong> <span className="text-green-400 font-bold">{data.status.toUpperCase()}</span></p>
            <p><strong className="text-yellow-400">Date Issued:</strong> {new Date(data.updated_at).toLocaleDateString()}</p>
          </CardContent>
        </>
      );
    }

    if (type === 'Scroll') {
      return (
        <>
          <FileText className="w-16 h-16 mx-auto text-yellow-400 mb-4" />
          <CardTitle className="text-2xl text-yellow-300 sacred-font">Sacred Scroll Verified</CardTitle>
          <CardContent className="mt-6 text-blue-200 space-y-2">
            <p><strong className="text-yellow-400">Title:</strong> {data.title}</p>
            <p><strong className="text-yellow-400">Published:</strong> {new Date(data.published_at).toLocaleDateString()}</p>
            {data.chain_tx_hash && (
              <p><strong className="text-yellow-400">XRPL Tx:</strong> <a href={`https://livenet.xrpl.org/transactions/${data.chain_tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{data.chain_tx_hash}</a></p>
            )}
          </CardContent>
        </>
      );
    }

    return null;
  };

  return (
    <>
      <Helmet>
        <title>Verification | Blockchain Ministries</title>
      </Helmet>
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-lg"
        >
          <Card className="celestial-bg border-yellow-400/20 text-center">
            <CardHeader>
              {loading ? (
                <>
                  <Loader2 className="w-16 h-16 mx-auto text-yellow-400 animate-spin mb-4" />
                  <CardTitle className="text-2xl text-yellow-300 sacred-font">Verifying...</CardTitle>
                </>
              ) : error ? (
                <>
                  <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                  <CardTitle className="text-2xl text-red-400 sacred-font">Verification Failed</CardTitle>
                  <CardContent className="mt-4 text-red-300">{error}</CardContent>
                </>
              ) : (
                <>
                  <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
                  {renderResult()}
                </>
              )}
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Verify;