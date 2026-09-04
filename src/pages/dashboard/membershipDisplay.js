/**
 * Reduces a raw membership row (Worker /api/membership/mine response, or a
 * raw Supabase `memberships` row) to only the fields safe to show a member
 * their own record. The membership row id, user_id, approved_by, and raw
 * application_json are never included here — the Worker already omits them
 * from its response, and this applies the same redaction to the Supabase
 * fallback path (a `select('*')`) so both paths render identically and
 * neither leaks an internal id through the UI.
 */
export function toDisplayMembership(raw) {
  if (!raw) return null;
  return {
    status: raw.application_status ?? raw.status ?? null,
    membershipType: raw.membership_type ?? null,
    paymentStatus: raw.payment_status ?? null,
    nftTokenId: raw.nft_token_id ?? null,
  };
}
