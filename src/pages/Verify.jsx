import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { api } from '@/lib/cloudflareApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, XCircle, FileText, Award, Ban, Link2 as LinkIcon } from 'lucide-react';
import { ordinationPresentation, ordinationFields } from './verifyStatus';

const Verify = () => {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState(null);
  const [incomplete, setIncomplete] = useState(false);

  useEffect(() => {
    const verifySlug = async () => {
      // M11: a verification link that arrived without its identifier - most
      // often truncated by a link parser, a line break in print, or a partial
      // copy/paste. This is NOT an error state and must not read like one.
      if (!slug) {
        setIncomplete(true);
        setLoading(false);
        return;
      }
      setIncomplete(false);

      setLoading(true);
      setError(null);

      try {
        // A single endpoint checks both ordinations and scrolls, and
        // already guarantees approved-only / safe-fields-only server-side
        // (no email, no internal id, no application_json, no approved_by,
        // no credential_r2_key) — nothing further to filter client-side.
        try {
          const res = await api.get(`/verify/${encodeURIComponent(slug)}`);
          if (res.type === 'ordination') {
            setVerificationResult({ type: 'Ordination', data: res.data });
          } else {
            setVerificationResult({ type: 'Scroll', data: res.data });
          }
        } catch (apiError) {
          if (apiError.status === 404) setError('Verification code is invalid or has expired.');
          else throw apiError;
        }
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
      // M11: presentation follows the SERVER's credential_status. A revoked
      // credential must never render with the valid presentation, so the
      // decision is made once, in a tested pure function, and simply obeyed
      // here. Status is carried in TEXT, never by colour alone.
      const view = ordinationPresentation(data);
      const rows = ordinationFields(data, view);

      return (
        <>
          {view.isValid
            ? <Award className="w-16 h-16 mx-auto text-yellow-400 mb-4" aria-hidden="true" />
            : <Ban className="w-16 h-16 mx-auto text-red-500 mb-4" aria-hidden="true" />}
          <CardTitle className={`text-2xl sacred-font ${view.isValid ? 'text-yellow-300' : 'text-red-400'}`}>
            {view.isValid ? 'Ordination Credential Verified' : 'Ordination Credential Revoked'}
          </CardTitle>
          <CardContent className="mt-6 text-blue-200 space-y-2">
            <p role="status">
              <strong className="text-yellow-400">Status: </strong>
              <span className={`font-bold ${view.isValid ? 'text-green-400' : 'text-red-400'}`}>
                {view.label}
              </span>
            </p>
            <p className={view.isValid ? 'text-blue-200' : 'text-red-300 font-semibold'}>{view.statement}</p>
            {rows.map(row => (
              <p key={row.key}>
                <strong className="text-yellow-400">{row.label}:</strong> {row.value}
              </p>
            ))}
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
              ) : incomplete ? (
                <>
                  <LinkIcon className="w-16 h-16 mx-auto text-yellow-400 mb-4" aria-hidden="true" />
                  <CardTitle className="text-2xl text-yellow-300 sacred-font">Verification Link Incomplete</CardTitle>
                  <CardContent className="mt-4 text-blue-200 space-y-2">
                    <p>This verification link is missing its credential identifier.</p>
                    <p className="text-sm text-blue-300">
                      Please scan the QR code again, or open the full verification address exactly
                      as printed on the credential.
                    </p>
                  </CardContent>
                </>
              ) : error ? (
                <>
                  <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                  <CardTitle className="text-2xl text-red-400 sacred-font">Verification Failed</CardTitle>
                  <CardContent className="mt-4 text-red-300">{error}</CardContent>
                </>
              ) : (
                // M11: no unconditional green check here. A successful LOOKUP
                // is not a valid credential — a revoked one also resolves 200.
                // Each result branch renders its own status icon so a revoked
                // credential can never inherit the positive presentation.
                renderResult()
              )}
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Verify;