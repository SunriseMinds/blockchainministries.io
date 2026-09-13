import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/cloudflareApi';
import { Heart, Loader2 } from 'lucide-react';
import { createRequestIds } from './givingRequest';

/**
 * M14.1 — one-time giving through HOSTED Stripe Checkout.
 *
 * Replaces the retired Stripe Elements form. Nothing here touches a card:
 * the Worker creates the Session and the browser is redirected to Stripe, so
 * this page needs no publishable key, no Stripe SDK, and never sees payment
 * details. Anonymous gifts are supported — identity, when there is one, is
 * resolved server-side from the session cookie and is never sent from here.
 *
 * The amount below is a REQUEST. The Worker re-validates it against its own
 * bounds ($1–$100,000 USD), which are the authority.
 */
const requestIds = createRequestIds();

const StripeOneTime = ({ config }) => {
  const { toast } = useToast();
  const suggested = config?.one_time?.suggested_cents ?? [];
  const minCents = config?.one_time?.min_cents ?? 100;
  const maxCents = config?.one_time?.max_cents ?? 10000000;

  const [amount, setAmount] = useState(() => (suggested[2] ?? 10000) / 100);
  const [busy, setBusy] = useState(false);

  const amountCents = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(amountCents) && amountCents >= minCents && amountCents <= maxCents;

  const give = async () => {
    if (!valid) {
      toast({
        title: 'Please check the amount',
        description: `Gifts can be between $${minCents / 100} and $${(maxCents / 100).toLocaleString()}.`,
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    // One id per intentional gift; a retry of THIS gift reuses it, so a
    // double-press cannot create a second Stripe Session.
    const key = `one-time:${amountCents}`;
    try {
      const data = await api.post('/donations/stripe/checkout', {
        mode: 'payment',
        amount_cents: amountCents,
        request_id: requestIds.forAction(key),
      });
      requestIds.complete(key);
      window.location.href = data.url;
    } catch (error) {
      // The Worker's own message is shown when it has one — e.g. its honest
      // "Stripe is not configured" while giving is not yet live. Presenting
      // that as a transient glitch would be misleading.
      toast({
        title: 'Could not start checkout',
        description: error.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Make a One-Time Gift</h2>
        <p className="text-blue-200">A single offering of any size, given once.</p>
      </div>

      <div className="space-y-4">
        <Label htmlFor="donation-amount" className="text-yellow-300 sacred-font">Amount (USD)</Label>
        <div className="grid grid-cols-3 gap-3">
          {suggested.map((cents) => (
            <Button
              key={cents}
              type="button"
              variant={amountCents === cents ? 'default' : 'outline'}
              onClick={() => setAmount(cents / 100)}
              aria-pressed={amountCents === cents}
              className={`min-h-11 border-yellow-400/50 ${
                amountCents === cents
                  ? 'bg-yellow-500 text-blue-950 hover:bg-yellow-400'
                  : 'text-yellow-300 hover:bg-yellow-400/10'
              }`}
            >
              ${(cents / 100).toLocaleString()}
            </Button>
          ))}
        </div>
        <Input
          type="number"
          id="donation-amount"
          inputMode="decimal"
          min={minCents / 100}
          max={maxCents / 100}
          placeholder="Other amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-h-11 bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
        />
      </div>

      <Button
        type="button"
        onClick={give}
        disabled={busy}
        className="min-h-12 w-full bg-gradient-to-r from-yellow-400 to-amber-500 py-6 text-lg font-bold text-blue-950 hover:from-yellow-500 hover:to-amber-600 disabled:opacity-60"
      >
        {busy ? (
          <><Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> Opening secure checkout…</>
        ) : (
          <>Give {valid ? `$${Number(amount).toLocaleString()}` : ''} <Heart className="ml-2 h-5 w-5" aria-hidden="true" /></>
        )}
      </Button>

      <p className="text-center text-sm text-blue-200">
        Payment is completed on Stripe&apos;s secure page. Blockchain Ministries never sees your card details.
        Gifts are voluntary and, as stated in our Terms, are not given in exchange for goods or services.
      </p>
    </div>
  );
};

export default StripeOneTime;
