/**
 * M14.4 — the scheduled XRPL reconciliation sweep.
 *
 * WHY THIS EXISTS AT ALL
 * The XRP Ledger has no webhooks. A donor who pays and closes the tab must
 * still be credited, so the fast path (donor submits a hash) cannot be the
 * only route. This sweep is the authoritative backstop: it reads the ministry
 * address's own validated history and records anything the fast path missed —
 * including payments nobody will ever come back to report.
 *
 * It shares `inspectTransaction` and `recordLedgerReceipt` with the fast path,
 * so the two cannot disagree about what counts as received, and the UNIQUE
 * transaction hash means discovering the same payment twice yields one row.
 *
 * Read-only with respect to the ledger. Nothing here signs.
 */
import { lookupAccountTransactions } from '@reellink/xrpl/client.js';
import { inspectTransaction, recordLedgerReceipt } from './xrplDonations.js';

/** A single sweep's ceiling, so one run can never become an unbounded scan. */
export const SWEEP_LIMIT = 50;

/**
 * Reconcile recent ledger activity for the donation address.
 *
 * BOUNDED on both axes: at most `limit` transactions are fetched, and the
 * scan starts at the highest ledger already recorded rather than at the
 * beginning of history. On a fresh database there is no high-water mark, so
 * the node's own default window applies and the limit does the bounding.
 *
 * FAILS SAFE. An RPC error aborts this run and returns a reason; nothing is
 * marked failed, nothing is credited, and the next run simply tries again.
 * Because the cursor is derived from what was actually persisted, an aborted
 * run loses no ground.
 *
 * @returns {{scanned:number, recorded:number, skipped:number, errors:number, from:number|null, reason?:string}}
 */
export async function reconcile(ctx, cfg, { limit = SWEEP_LIMIT } = {}) {
  const { repos } = await import('../db/repositories.js');
  const repo = repos(ctx.env.DB);

  const from = await repo.donations.maxXrplLedgerIndex();
  const summary = { scanned: 0, recorded: 0, skipped: 0, errors: 0, from };

  let page;
  try {
    page = await lookupAccountTransactions(cfg.rpcUrl, {
      account: cfg.address,
      // Resume from the last recorded ledger (inclusive, so a ledger holding
      // two payments cannot lose the second one). -1 = the node's default.
      ledgerIndexMin: from ?? -1,
      limit,
    });
  } catch {
    // Timeout, 429, 5xx, malformed body — all the same answer: not now.
    // A temporary node problem must never look like a payment problem.
    return { ...summary, reason: 'rpc_unavailable' };
  }

  const entries = Array.isArray(page?.transactions) ? page.transactions : [];
  for (const entry of entries) {
    summary.scanned += 1;
    const verified = inspectTransaction(entry, cfg);
    if (!verified.ok) { summary.skipped += 1; continue; }
    try {
      const result = await recordLedgerReceipt(repo, cfg, verified);
      if (result.recorded) summary.recorded += 1;
      else summary.skipped += 1;   // already recorded, or intent repaired only
    } catch {
      // One bad row must not abandon the rest of the sweep.
      summary.errors += 1;
    }
  }
  return summary;
}
