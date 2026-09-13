import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, Gem, Heart, Coins, Wallet, Loader2, CheckCircle2, Info } from 'lucide-react';
import { api } from '@/lib/cloudflareApi';
import StripeTiers from './Donate/components/StripeTiers';
import StripeOneTime from './Donate/components/StripeOneTime';
import XrpGive from './Donate/components/XrpGive';
import PayPalGive from './Donate/components/PayPalGive';

/**
 * M14.1 — Stripe-only giving.
 *
 * PayPal and the XRP donation QR were removed from this page. Both could be
 * seen by the public as ministry payment methods while neither had any
 * backend: PayPal's approval handler wrote nothing anywhere, and the XRP
 * address could receive funds the platform has no way to record or
 * acknowledge. Advertising a channel the ministry cannot account for is worse
 * than not offering it, so both are gone until they have a real
 * implementation. Nothing outside this page changed — XRPL infrastructure and
 * the EFT TrustLine link are untouched.
 */
const Donate = () => {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);
  const [params] = useSearchParams();
  const checkout = params.get('checkout');

  useEffect(() => {
    let live = true;
    api.get('/donations/config')
      .then((data) => { if (live) setConfig(data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <>
      <Helmet>
        <title>Donate & Support - Blockchain Ministries</title>
        <meta name="description" content="Support the Scroll. Every ministry gift is a covenant offering to protect truth, light, and sacred infrastructure." />
      </Helmet>
      <div className="text-white">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <Gift className="w-24 h-24 mx-auto text-yellow-400 mb-4 sacred-pulse" aria-hidden="true" />
          <h1 className="text-5xl md:text-6xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 15px rgba(251, 191, 36, 0.3)' }}>
            Support the Scroll
          </h1>
          <p className="text-lg md:text-xl text-blue-200 max-w-3xl mx-auto">
            Every ministry gift is a covenant offering to protect truth, light, and sacred infrastructure.
          </p>
        </motion.div>

        {/* Return from Stripe. The query parameter records only that the donor
            came back through a particular link — it proves nothing about the
            payment, which the webhook and database alone establish. The copy
            is careful never to assert that money moved. */}
        {checkout === 'success' && (
          <div role="status" className="mx-auto mb-10 flex max-w-3xl items-start gap-3 rounded-lg border border-green-400/40 bg-green-900/20 p-4 text-green-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-300" aria-hidden="true" />
            <p>
              Your checkout was completed. Payment confirmation may take a moment to appear — a signed-in
              member will see the gift in their dashboard once it is recorded. Thank you for your support.
            </p>
          </div>
        )}
        {checkout === 'cancelled' && (
          <div role="status" className="mx-auto mb-10 flex max-w-3xl items-start gap-3 rounded-lg border border-yellow-400/40 bg-yellow-900/20 p-4 text-yellow-100">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" aria-hidden="true" />
            <p>
              No completed checkout was recorded through that attempt, and nothing was charged. You are
              welcome to try again whenever you are ready.
            </p>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
        >
          <Card className="celestial-bg border-yellow-400/20 max-w-5xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl text-yellow-300 sacred-font">Make a Covenant Offering</CardTitle>
              <CardDescription className="text-blue-300">Give once, or support the ministry each month.</CardDescription>
            </CardHeader>
            <CardContent>
              {!config && !failed && (
                <div className="flex items-center justify-center gap-3 p-10" role="status">
                  <Loader2 className="h-6 w-6 animate-spin text-yellow-400" aria-hidden="true" />
                  <span className="text-blue-200">Loading giving options…</span>
                </div>
              )}
              {failed && (
                <p role="alert" className="p-10 text-center text-blue-200">
                  Giving options could not be loaded just now. Please refresh the page, or{' '}
                  <a href="/contact" className="text-yellow-300 underline underline-offset-4">contact the ministry</a>.
                </p>
              )}
              {config && (
                <Tabs defaultValue="card" className="w-full">
                  <TabsList className="flex h-auto w-full flex-wrap justify-center gap-1 bg-blue-900/50 border border-yellow-400/20">
                    <TabsTrigger value="card" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">
                      <Heart className="w-4 h-4 mr-2" aria-hidden="true" />Card
                    </TabsTrigger>
                    {/* M14.4 — XRP is a first-class rail, not a footnote. */}
                    <TabsTrigger value="paypal" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">
                      <Wallet className="w-4 h-4 mr-2" aria-hidden="true" />PayPal
                    </TabsTrigger>
                    <TabsTrigger value="xrp" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">
                      <Coins className="w-4 h-4 mr-2" aria-hidden="true" />XRP
                    </TabsTrigger>
                    <TabsTrigger value="monthly" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">
                      <Gem className="w-4 h-4 mr-2" aria-hidden="true" />Monthly
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="card" className="mt-8">
                    <StripeOneTime config={config} />
                  </TabsContent>

                  <TabsContent value="paypal" className="mt-8">
                    <PayPalGive config={config} />
                  </TabsContent>

                  <TabsContent value="xrp" className="mt-8">
                    <XrpGive config={config} />
                  </TabsContent>

                  <TabsContent value="monthly" className="mt-8">
                    <StripeTiers config={config} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Deliberately states what giving DOES, and promises nothing the
            ministry has not built. See Terms §5. */}
        <section className="mt-16 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-yellow-300 mb-4 sacred-font">Where Your Gift Goes</h2>
          <p className="text-blue-200">
            Gifts sustain the ministry&apos;s work and the infrastructure that carries it — ordination
            and credentialing, the preservation of the scrolls, and the systems that keep them
            available. Giving is voluntary and is not a purchase of goods or services.
          </p>
        </section>
      </div>
    </>
  );
};

export default Donate;
