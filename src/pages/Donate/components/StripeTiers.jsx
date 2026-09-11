import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Gem, Shield, Crown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';
import { api } from '@/lib/cloudflareApi';
import { useAuth } from '@/contexts/AuthProvider';
import { CHECKOUT_ENABLED } from './checkoutAvailability';

const tiers = [
  {
    name: 'Supporter',
    price: 10,
    priceId: 'price_supporter_tier', // Replace with your actual Price ID from Stripe
    tokenReward: 100,
    icon: Gem,
    features: ['Basic Scroll Access', '100 EFT Reward Monthly', 'Community Badge'],
    color: 'text-green-400',
    borderColor: 'border-green-400/30',
    buttonClass: 'bg-green-600 hover:bg-green-700',
  },
  {
    name: 'Guardian',
    price: 50,
    priceId: 'price_guardian_tier', // Replace with your actual Price ID from Stripe
    tokenReward: 600,
    icon: Shield,
    features: ['Full Scroll Access', '600 EFT Reward Monthly', 'Priority Support', 'DAO Voting Rights'],
    color: 'text-blue-400',
    borderColor: 'border-blue-400/30',
    buttonClass: 'bg-blue-600 hover:bg-blue-700',
    popular: true,
  },
  {
    name: 'Archangel',
    price: 100,
    priceId: 'price_archangel_tier', // Replace with your actual Price ID from Stripe
    tokenReward: 1400,
    icon: Crown,
    features: ['All Access', '1400 EFT Reward Monthly', 'Direct Council Access', 'Exclusive Previews'],
    color: 'text-yellow-400',
    borderColor: 'border-yellow-400/30',
    buttonClass: 'bg-yellow-600 hover:bg-yellow-700',
  },
];

const StripeTiers = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const handleCheckout = async (priceId) => {
    toast({
      title: 'Redirecting to Checkout...',
      description: 'Please wait while we prepare the sacred portal.',
    });

    try {
      if (!user) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in or sign up to subscribe.',
          variant: 'destructive',
        });
        return;
      }
      // The Worker derives identity from the session cookie and, if the
      // user already has a Stripe customer, reuses it server-side — this
      // call sends ONLY the tier selection, never a user id or customer id.
      const data = await api.post('/donations/stripe/checkout', {
        mode: 'subscription',
        price_id: priceId,
      });
      window.location.href = data.url;
    } catch (error) {
      // Surface the server's own message when there is one — e.g. the
      // Worker's honest "This membership tier is not configured yet" for a
      // placeholder price id, which is not a transient failure and must not
      // be presented as one ("Please try again" would be actively misleading
      // for that specific case).
      toast({
        title: 'Checkout Error',
        description: error.message || 'Could not initialize checkout. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Join a Covenant Tier</h2>
      <p className="text-blue-200 mb-8 max-w-2xl mx-auto">Support our mission with a monthly recurring donation and receive continuous rewards.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {tiers.map((tier, index) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <Card className={`celestial-bg h-full flex flex-col ${tier.borderColor} ${tier.popular ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20' : ''}`}>
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-sm font-bold">
                  Most Popular
                </div>
              )}
              <CardHeader className="text-center">
                <tier.icon className={`w-12 h-12 mx-auto mb-4 ${tier.color}`} />
                <CardTitle className={`text-2xl sacred-font ${tier.color}`}>{tier.name}</CardTitle>
                <CardDescription className="text-blue-300">
                  <span className="text-4xl font-bold text-white">${tier.price}</span> / month
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <ul className="space-y-3 text-left">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                      <span className="text-blue-200">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {/* M12: recurring giving is not yet operational. Offering a
                    button that can only fail is not honest, so the action is
                    disabled until real Stripe prices are configured — at which
                    point CHECKOUT_ENABLED flips and handleCheckout takes over
                    unchanged. */}
                <Button
                  onClick={CHECKOUT_ENABLED ? () => handleCheckout(tier.priceId) : undefined}
                  disabled={!CHECKOUT_ENABLED}
                  aria-disabled={!CHECKOUT_ENABLED}
                  className={
                    CHECKOUT_ENABLED
                      ? `w-full font-bold text-lg py-6 text-white ${tier.buttonClass}`
                      : 'w-full font-semibold text-base py-6 bg-blue-900/40 text-blue-200 border border-yellow-400/20 cursor-not-allowed hover:bg-blue-900/40'
                  }
                >
                  {CHECKOUT_ENABLED ? `Choose ${tier.name}` : 'Coming Soon'}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>
      {!CHECKOUT_ENABLED && (
        <p className="text-sm text-blue-200 mt-8 max-w-2xl mx-auto">
          Covenant tiers are being prepared and are not yet open for enrolment. To support the
          ministry today, please use the giving options above, or{' '}
          <Link to="/contact" className="text-yellow-300 underline underline-offset-4 hover:text-yellow-200">
            contact the ministry
          </Link>{' '}
          about current arrangements.
        </p>
      )}
    </div>
  );
};

export default StripeTiers;