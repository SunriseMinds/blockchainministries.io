import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/cloudflareApi';
import { Loader2, Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * M14.4 — accountable XRP giving.
 *
 * NOT the bare address QR this replaced. Every gift is issued a unique
 * DESTINATION TAG first, so an incoming ledger payment can be attributed to
 * the donor who intended it. Confirmation comes from the validated XRP Ledger
 * — never from this page, and never from the donor returning to it.
 *
 * Wallet-agnostic by design: the QR encodes a standard XRPL payment URI that
 * any compatible wallet or tag-supporting exchange can read. No single vendor
 * is required.
 */
const CopyField = ({ label, value, mono = true }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable; the value is selectable on screen */ }
  };
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-yellow-400/80">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 break-all rounded bg-blue-950/60 px-3 py-2 text-blue-100 ${mono ? 'font-mono text-sm' : ''}`}>
          {value}
        </code>
        <Button
          type="button" variant="outline" size="sm" onClick={copy}
          aria-label={`Copy ${label}`}
          className="min-h-11 shrink-0 border-yellow-400/50 text-yellow-300"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
};

const XrpGive = ({ config }) => {
  const { toast } = useToast();
  const xrp = config?.xrp ?? {};
  const [amount, setAmount] = useState('25');
  const [intent, setIntent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  if (!xrp.available) {
    return (
      <p className="mx-auto max-w-lg py-8 text-center text-blue-200">
        XRP giving is being prepared and is not yet open. Please use one of the other options,
        or <a href="/contact" className="text-yellow-300 underline underline-offset-4">contact the ministry</a>.
      </p>
    );
  }

  const start = async () => {
    setBusy(true); setResult(null);
    try {
      const data = await api.post('/donations/xrpl/intents', { amount_xrp: String(amount).trim() });
      setIntent(data);
    } catch (error) {
      toast({ title: 'Could not prepare the gift', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const data = await api.post('/donations/xrpl/verify', { tx_hash: hash.trim() });
      setResult(data);
    } catch (error) {
      toast({ title: 'Could not check that transaction', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally { setVerifying(false); }
  };

  const OUTCOMES = {
    confirmed: 'Received and recorded. Thank you.',
    already_recorded: 'This gift was already recorded. Thank you.',
    not_validated_yet: 'The ledger has not finished validating this transaction yet. Please try again shortly.',
    wrong_destination: 'That transaction was not sent to the ministry address.',
    failed_transaction: 'That transaction did not succeed on the ledger.',
    unsupported_asset: 'That payment was not XRP.',
    invalid_transaction: 'That transaction could not be read as an XRP payment.',
    temporarily_unavailable: 'The ledger could not be reached just now. Your gift is safe — it will be picked up automatically.',
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Give with XRP</h2>
        <p className="text-blue-200">A gift sent directly on the XRP Ledger.</p>
      </div>

      {/* Network honesty. Testnet XRP is not money and the page must say so. */}
      {!xrp.live && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-400/50 bg-amber-900/25 p-4 text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <p>
            <strong>XRPL {String(xrp.network).toUpperCase()} — test funds only.</strong> This is a test network.
            XRP sent here has <strong>no monetary value</strong> and is not a real donation to the ministry.
          </p>
        </div>
      )}

      {!intent && (
        <div className="space-y-4">
          <Label htmlFor="xrp-amount" className="text-yellow-300 sacred-font">Amount (XRP)</Label>
          <div className="grid grid-cols-4 gap-3">
            {(xrp.suggested_xrp ?? []).map((v) => (
              <Button
                key={v} type="button"
                variant={String(amount) === v ? 'default' : 'outline'}
                onClick={() => setAmount(v)}
                aria-pressed={String(amount) === v}
                className={`min-h-11 border-yellow-400/50 ${String(amount) === v ? 'bg-yellow-500 text-blue-950 hover:bg-yellow-400' : 'text-yellow-300 hover:bg-yellow-400/10'}`}
              >
                {v}
              </Button>
            ))}
          </div>
          <Input
            id="xrp-amount" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Other amount in XRP"
            className="min-h-11 bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
          />
          <Button
            type="button" onClick={start} disabled={busy}
            className="min-h-12 w-full bg-gradient-to-r from-yellow-400 to-amber-500 py-6 text-lg font-bold text-blue-950 hover:from-yellow-500 hover:to-amber-600 disabled:opacity-60"
          >
            {busy ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> Preparing…</> : 'Continue'}
          </Button>
        </div>
      )}

      {intent && (
        <div className="space-y-5">
          <div className="flex justify-center rounded-lg bg-white p-4">
            <QRCodeCanvas value={intent.payment_uri} size={192} includeMargin={false} />
          </div>

          <CopyField label="Ministry XRP address" value={intent.address} />
          <CopyField label="Destination tag" value={String(intent.destination_tag)} />
          <CopyField label="Amount" value={`${intent.amount_xrp} XRP`} mono={false} />

          <div className="rounded-lg border border-yellow-400/30 bg-blue-950/40 p-4 text-sm text-blue-200">
            <p className="mb-2 font-semibold text-yellow-300">The destination tag matters</p>
            <p>
              The tag above is what tells the ministry this gift came from you. Most wallets and
              exchanges have a field for it. If you send without the tag the gift still reaches the
              ministry, but attributing it to you may be delayed.
            </p>
            <p className="mt-2">
              Your gift is confirmed by the XRP Ledger itself, not by this page — it will appear once
              the transaction is validated, even if you close this tab.
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="xrp-hash" className="text-yellow-300 sacred-font">Already sent it?</Label>
            <p className="text-sm text-blue-200">Paste the transaction hash to check it straight away.</p>
            <Input
              id="xrp-hash" value={hash} onChange={(e) => setHash(e.target.value)}
              placeholder="Transaction hash"
              className="min-h-11 bg-blue-900/50 border-yellow-400/30 font-mono text-sm text-white placeholder-blue-300"
            />
            <Button
              type="button" onClick={verify} disabled={verifying || hash.trim().length < 64}
              variant="outline"
              className="min-h-11 w-full border-yellow-400/50 text-yellow-300"
            >
              {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Checking the ledger…</> : 'Check the ledger'}
            </Button>
            {result && (
              <div role="status" className="rounded-lg border border-yellow-400/40 bg-blue-950/50 p-3 text-blue-100">
                <p>{OUTCOMES[result.outcome] ?? 'That transaction could not be confirmed.'}</p>
                {result.reference_url && (
                  <a href={result.reference_url} target="_blank" rel="noopener noreferrer"
                     className="mt-2 inline-flex items-center gap-1 text-yellow-300 underline underline-offset-4">
                    View on the ledger explorer <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>

          <Button type="button" variant="link" onClick={() => { setIntent(null); setResult(null); setHash(''); }}
                  className="min-h-11 w-full text-blue-300">
            Start over
          </Button>
        </div>
      )}
    </div>
  );
};

export default XrpGive;
