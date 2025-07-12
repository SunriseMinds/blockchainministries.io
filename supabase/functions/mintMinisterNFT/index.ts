/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />
// @ts-nocheck
/**
 * Supabase Edge Function to mint an XLS-20 NFT credential on the XRP Ledger via XUMM API.
 * Triggered after admin approval of a minister profile.
 *
 * Expected POST body JSON:
 * {
 *   "ministerName": string,
 *   "credentialId": string,
 *   "roleTitle": string,
 *   "issuedDate": string (ISO date),
 *   "supabaseUserId": string,
 *   "minterAccount": string (XRP Ledger address of issuer)
 * }
 *
 * Metadata is embedded as a data URI containing JSON:
 * {
 *   ministerName,
 *   credentialId,
 *   roleTitle,
 *   issuedDate,
 *   supabaseUserId
 * }
 */

// @ts-ignore: Deno standard library import
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";

const XUMM_API_KEY = Deno.env.get("XUMM_API_KEY") || "";
const XUMM_API_SECRET = Deno.env.get("XUMM_API_SECRET") || "";
const XUMM_API_BASE = "https://xumm.app/api/v1";

/**
 * Hex-encode a UTF-8 string for the NFT URI field.
 */
function toHex(str: string): string {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint an NFT via XUMM API.
 */
async function mintNFTOnXumm(minterAccount: string, uriHex: string) {
  const payload = {
    txjson: {
      TransactionType: "NFTokenMint",
      Account: minterAccount,
      NFTokenTaxon: 0,
      Flags: 8, // tfTransferable
      URI: uriHex,
    },
    options: {
      submit: true,
      expire: 3600,
    },
  };

  const response = await fetch(`${XUMM_API_BASE}/platform/payload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": XUMM_API_KEY,
      "X-API-Secret": XUMM_API_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`XUMM API error: ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const {
      ministerName,
      credentialId,
      roleTitle,
      issuedDate,
      supabaseUserId,
      minterAccount,
    } = body;

    if (
      !ministerName ||
      !credentialId ||
      !roleTitle ||
      !issuedDate ||
      !supabaseUserId ||
      !minterAccount
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build metadata and embed as data URI
    const metadata = {
      ministerName,
      credentialId,
      roleTitle,
      issuedDate,
      supabaseUserId,
    };
    const jsonString = JSON.stringify(metadata);
    const dataUri = `data:application/json;utf8,${encodeURIComponent(jsonString)}`;
    const uriHex = toHex(dataUri);

    // Call XUMM to mint
    const xummPayload = await mintNFTOnXumm(minterAccount, uriHex);

    return new Response(
      JSON.stringify({ success: true, xummPayload }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
