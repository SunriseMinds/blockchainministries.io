import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gem, Shield, Crown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';
import { api } from '@/lib/cloudflareApi';
import { useAuth } from '@/contexts/AuthProvider';
import { createRequestIds } from './givingRequest';

/**
 * M14.1 — monthly support tiers.
 *
 * TWO THINGS CHANGED HERE, BOTH ABOUT HONESTY.
 *
 * 1. No price ids. This file used to hold the tier price ids AND a second
 *    mirrored copy lived in checkoutAvailability.js, with nothing linking
 *    them — update one and the UI either refused a working checkout or
 *    offered one the server rejects. The catalogue now lives once, server-side
 *    (worker/config/tiers.js), and reaches this page through
 *    GET /api/donations/config. The browser sends a TIER KEY; it cannot name
 *    a Stripe Price at all.
 *
 * 2. No benefit promises. The tiers previously guaranteed monthly EFT
 *    rewards, scroll access, priority support and DAO voting rights — none of
 *    which is implemented, and all of which contradicted the Terms, which say
 *    donations do not purchase goods or services. They are monthly support
 *    levels, described as such. No replacement benefits were invented.
 */
const ICONS = { supporter: Gem, guardian: Shield, archangel: Crown };
const STYLES = {
  supporter: { color: 'text-green-400', borderColor: 'border-green-400/30', buttonClass: 'bg-green-600 hover:bg-green-700' },
  guardian: { color: 'text-blue-400', borderColor: 'border-blue-400/30', buttonClass: 'bg-blue-600 hover:bg-blue-700' },
  archangel: { color: 'text-yellow-400', borderColor: 'border-yellow-400/30', buttonClass: 'bg-yellow-600 hover:bg-yellow-700' },
};

const requestIds = createRequestIds();

const StripeTiers = ({ config }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const tiers = config?.tiers ?? [];

  const handleCheckout = async (tier) => {
    if (!user) {
      toast({
        title: 'Please sign in first',
        description: 'Monthly support is linked to your account, so it can be managed later.',
        variant: 'destructive',
      });
      return;
    }
    const key = `tier:${tier.key}`;
    try {
      // Only the tier key travels. Identity and the Stripe Price are both
      // resolved server-side; neither can be supplied from here.
      const data = await api.post('/donations/stripe/checkout', {
        mode: 'subscription',
        tier: tier.key,
        request_id: requestIds.forAction(key),
      });
      requestIds.complete(key);
      window.location.href = data.url;
    } catch (error) {
      toast({
        title: 'Could not start checkout',
        description: error.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    }
  };

  /**
   * M14.5B — monthly giving through PayPal.
   *
   * The tier key is the ONLY thing that travels; the server resolves it to a
   * PayPal Plan id exactly as it resolves a Stripe Price. A tier whose Plan id
   * is still a placeholder reports `paypal_available: false` and renders a
   * disabled, honest button — the same markup that will simply start working
   * once real plan ids exist. No redesign, and no faked readiness.
   */
  const handlePayPal = async (tier) => {
    if (!user) {
      toast({
        title: 'Please sign in first',
        description: 'Monthly support is linked to your account, so it can be managed later.',
        variant: 'destructive',
      });
      return;
    }
    const key = `paypal-tier:${tier.key}`;
    try {
      const data = await api.post('/donations/paypal/subscriptions', {
        tier: tier.key,
        request_id: requestIds.forAction(key),
      });
      requestIds.complete(key);
      if (data.approval_url) window.location.href = data.approval_url;
      else toast({ title: 'PayPal could not start that subscription', description: 'Please try again in a moment.', variant: 'destructive' });
    } catch (error) {
      toast({
        title: 'Could not start monthly support',
        description: error.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    }
  };

  const anyAvailable = tiers.some((t) => t.available);
  const paypalConfigured = config?.paypal?.available === true;
  const paypalRecurring = config?.paypal?.recurring_available === true;

  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Monthly Support</h2>
      <p className="text-blue-200 mb-8 max-w-2xl mx-auto">
        Choose a level of ongoing support for the ministry. You can change or stop it at any time.
        The names for these levels have not been settled yet, so each is shown by its monthly amount.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {tiers.map((tier, index) => {
          const Icon = ICONS[tier.key] ?? Gem;
          const style = STYLES[tier.key] ?? STYLES.supporter;
          return (
            <motion.div
              key={tier.key}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className={`celestial-bg h-full flex flex-col ${style.borderColor}`}>
                <CardHeader className="text-center">
                  <Icon className={`w-12 h-12 mx-auto mb-4 ${style.color}`} aria-hidden="true" />
                  {/* M14 checkpoint — the AMOUNT identifies the level, not a
                      name. "Supporter/Guardian/Archangel" are inherited
                      working labels the owner has not approved as ministry
                      terminology, so presenting one as a heading would imply
                      a decision that has not been made. No replacement name
                      is invented here; the monthly amount is simply the
                      honest identity until the owner chooses one. */}
                  <CardTitle className={`text-2xl sacred-font ${style.color}`}>
                    ${tier.amount_cents / 100} / month
                  </CardTitle>
                  <CardDescription className="text-blue-300">
                    Recurring gift
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-blue-200">
                    Ongoing monthly support for the mission and infrastructure of Blockchain Ministries.
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-3">
                  <Button
                    onClick={tier.available ? () => handleCheckout(tier) : undefined}
                    disabled={!tier.available}
                    aria-disabled={!tier.available}
                    className={
                      tier.available
                        ? `min-h-12 w-full py-6 text-lg font-bold text-white ${style.buttonClass}`
                        : 'min-h-12 w-full cursor-not-allowed border border-yellow-400/20 bg-blue-900/40 py-6 text-base font-semibold text-blue-200 hover:bg-blue-900/40'
                    }
                  >
                    {tier.available ? `Support at $${tier.amount_cents / 100}/month` : 'Coming Soon'}
                  </Button>
                  {/* The PayPal peer. Present whenever PayPal itself is
                      configured, disabled and honest until the tier has a
                      real Plan id. */}
                  {paypalConfigured && (
                    <Button
                      variant="outline"
                      onClick={tier.paypal_available ? () => handlePayPal(tier) : undefined}
                      disabled={!tier.paypal_available}
                      aria-disabled={!tier.paypal_available}
                      className={
                        tier.paypal_available
                          ? 'min-h-12 w-full border-yellow-400/50 py-5 text-base font-semibold text-yellow-300 hover:bg-yellow-400/10'
                          : 'min-h-12 w-full cursor-not-allowed border-yellow-400/20 bg-blue-900/40 py-5 text-sm font-semibold text-blue-200 hover:bg-blue-900/40'
                      }
                    >
                      {tier.paypal_available ? 'Support with PayPal' : 'PayPal monthly not open yet'}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </motion.div>
          );
        })}
      </div>
      {!anyAvailable && (
        <p className="text-sm text-blue-200 mt-8 max-w-2xl mx-auto">
          Monthly support is being prepared and is not yet open for enrolment. To support the ministry
          today, please use the one-time gift option, or{' '}
          <Link to="/contact" className="text-yellow-300 underline underline-offset-4 hover:text-yellow-200">
            contact the ministry
          </Link>{' '}
          about current arrangements.
        </p>
      )}
      {!paypalRecurring && (
        <p className="text-sm text-blue-200 mt-6 max-w-2xl mx-auto">
          Monthly giving through PayPal is not open yet. PayPal is available today for one-time gifts
          under the PayPal tab.
        </p>
      )}
    </div>
  );
};

export default StripeTiers;
