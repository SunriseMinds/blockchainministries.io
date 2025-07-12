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
 *   "supabaseUserId": string
 * }
 * 
 * This function calls the XUMM API to create and submit an NFT mint transaction.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const XUMM_API_KEY = Deno.env.get("XUMM_API_KEY") || "";
const XUMM_API_SECRET = Deno.env.get("XUMM_API_SECRET") || "";
const XUMM_API_BASE = "https://xumm.app/api/v1";

async function createXummPayload(metadata: any) {
  // Create a payload for minting XLS-20 NFT on XRP Ledger
  // Reference: https://xumm.readme.io/reference/create-payload
  const payload = {
    txjson: {
      TransactionType: "NFTokenMint",
      Account: metadata.account, // The account minting the NFT (XUMM user wallet)
      NFTokenTaxon: 0,
      Flags: 8, // tfTransferable flag
      URI: metadata.uri, // URI to metadata JSON (hex encoded)
      // Additional fields as needed
    },
    options: {
      submit: true,
      expire: 3600,
    },
  };
  return payload;
}

async function mintNFTOnXumm(minterAccount: string, metadataUri: string) {
  // Create payload and submit to XUMM API
  const payload = {
    txjson: {
      TransactionType: "NFTokenMint",
      Account: minterAccount,
      NFTokenTaxon: 0,
      Flags: 8, // tfTransferable
      URI: toHex(metadataUri),
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

  const data = await response.json();
  return data;
}

function toHex(str: string) {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
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
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Construct metadata JSON URI or embed metadata as needed
    // For simplicity, we assume metadataUri is a URL to metadata JSON hosted somewhere
    // In production, you might upload metadata to IPFS or other storage and use that URI
    const metadataUri = `https://example.com/metadata/${credentialId}.json`;

    // Call XUMM API to mint NFT
    const xummResponse = await mintNFTOnXumm(minterAccount, metadataUri);

    return new Response(
      JSON.stringify({ success: true, xummPayload: xummResponse }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
