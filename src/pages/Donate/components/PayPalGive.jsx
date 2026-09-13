import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/cloudflareApi';
import { Loader2 } from 'lucide-react';
import { createRequestIds } from './givingRequest';

/**
 * M14.5 — one-time giving through PayPal.
 *
 * NOT the deleted legacy component. That one hard-coded a placeholder plan,
 * wrote nothing to any server, and announced success from a toast. Here the
 * SERVER creates the order, the SERVER captures it, and the signed webhook is
 * what actually records the gift.
 *
 * The SDK is loaded lazily, HERE, and only when PayPal is configured — never
 * sitewide. The previous build pulled PayPal's script into every page
 * including admin and verify; that was a defect and it stays fixed.
 */
const requestIds = createRequestIds();

/** Load the PayPal SDK once, on demand. Resolves when `window.paypal` exists. */
function loadSdk(clientId) {
  if (window.paypal) return Promise.resolve(window.paypal);
  const existing = document.querySelector('script[data-paypal-sdk]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.paypal), { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    s.async = true;
    s.dataset.paypalSdk = 'true';
    s.onload = () => resolve(window.paypal);
    s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });
}

const PayPalGive = ({ config }) => {
  const { toast } = useToast();
  const pp = config?.paypal ?? {};
  const suggested = config?.one_time?.suggested_cents ?? [];
  const minCents = config?.one_time?.min_cents ?? 100;
  const maxCents = config?.one_time?.max_cents ?? 10000000;

  const [amount, setAmount] = useState(() => (suggested[2] ?? 10000) / 100);
  const [sdkReady, setSdkReady] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const holder = useRef(null);
  const amountRef = useRef(amount);
  amountRef.current = amount;

  useEffect(() => {
    if (!pp.available) return undefined;
    let live = true;
    loadSdk(pp.client_id)
      .then(() => { if (live) setSdkReady(true); })
      .catch(() => { if (live) toast({ title: 'PayPal could not load', description: 'Please try another option.', variant: 'destructive' }); });
    return () => { live = false; };
  }, [pp.available, pp.client_id, toast]);

  useEffect(() => {
    if (!sdkReady || !holder.current || !window.paypal) return undefined;
    holder.current.innerHTML = '';
    let cancelled = false;

    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'donate' },
      // The server creates the order. The browser only asks for an amount,
      // and the server validates it against its own policy.
      createOrder: async () => {
        const cents = Math.round(Number(amountRef.current) * 100);
        const key = `paypal-one-time:${cents}`;
        const data = await api.post('/donations/paypal/orders', {
          amount_cents: cents,
          request_id: requestIds.forAction(key),
        });
        return data.id;
      },
      // The server captures. `onApprove` is not proof that money arrived —
      // the webhook is, and the copy below says so.
      onApprove: async (data) => {
        try {
          const res = await api.post(`/donations/paypal/orders/${data.orderID}/capture`, {});
          requestIds.complete(`paypal-one-time:${Math.round(Number(amountRef.current) * 100)}`);
          if (!cancelled) setOutcome(res.capture_status === 'COMPLETED' ? 'captured' : 'pending');
        } catch (error) {
          if (!cancelled) toast({ title: 'Could not complete that gift', description: error.message || 'Please try again.', variant: 'destructive' });
        }
      },
      onError: () => {
        if (!cancelled) toast({ title: 'PayPal reported a problem', description: 'Please try again in a moment.', variant: 'destructive' });
      },
    }).render(holder.current).catch(() => { /* container removed during render */ });

    return () => { cancelled = true; };
  }, [sdkReady, toast]);

  if (!pp.available) {
    return (
      <p className="mx-auto max-w-lg py-8 text-center text-blue-200">
        PayPal giving is being prepared and is not yet open. Please use one of the other options,
        or <a href="/contact" className="text-yellow-300 underline underline-offset-4">contact the ministry</a>.
      </p>
    );
  }

  const cents = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(cents) && cents >= minCents && cents <= maxCents;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Give with PayPal</h2>
        <p className="text-blue-200">A single offering through your PayPal account.</p>
      </div>

      {!pp.live && (
        <div role="status" className="rounded-lg border border-amber-400/50 bg-amber-900/25 p-4 text-amber-100">
          <strong>PayPal {String(pp.environment).toUpperCase()}</strong> — test environment. No real money moves.
        </div>
      )}

      <div className="space-y-4">
        <Label htmlFor="paypal-amount" className="text-yellow-300 sacred-font">Amount (USD)</Label>
        <div className="grid grid-cols-3 gap-3">
          {suggested.map((c) => (
            <Button
              key={c} type="button"
              variant={cents === c ? 'default' : 'outline'}
              onClick={() => setAmount(c / 100)}
              aria-pressed={cents === c}
              className={`min-h-11 border-yellow-400/50 ${cents === c ? 'bg-yellow-500 text-blue-950 hover:bg-yellow-400' : 'text-yellow-300 hover:bg-yellow-400/10'}`}
            >
              ${(c / 100).toLocaleString()}
            </Button>
          ))}
        </div>
        <Input
          id="paypal-amount" type="number" inputMode="decimal"
          min={minCents / 100} max={maxCents / 100}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Other amount"
          className="min-h-11 bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
        />
        {!valid && (
          <p role="alert" className="text-sm text-amber-200">
            Gifts can be between ${minCents / 100} and ${(maxCents / 100).toLocaleString()}.
          </p>
        )}
      </div>

      {!sdkReady && (
        <div className="flex items-center justify-center gap-3 p-6" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-yellow-400" aria-hidden="true" />
          <span className="text-blue-200">Loading PayPal…</span>
        </div>
      )}
      <div ref={holder} aria-label="PayPal giving options" />

      {outcome && (
        <div role="status" className="rounded-lg border border-green-400/40 bg-green-900/20 p-4 text-green-100">
          {outcome === 'captured'
            ? 'Your PayPal approval was completed. Payment confirmation may take a moment to appear — a signed-in member will see the gift in their dashboard once it is recorded.'
            : 'PayPal is still processing this payment. It will appear once it is confirmed.'}
        </div>
      )}

      <p className="text-center text-sm text-blue-200">
        Gifts are voluntary and, as stated in our Terms, are not given in exchange for goods or services.
      </p>
    </div>
  );
};

export default PayPalGive;
