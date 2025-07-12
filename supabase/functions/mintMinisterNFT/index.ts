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

// If running in Deno, ensure you have internet access and the URL is correct:
// import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createServer } from "http";

// If running in Node.js, comment out the above line and use the following instead:
// import { createServer } from "http";
// (You will also need to refactor the rest of the code to use Node.js HTTP server API)

// Environment variable access compatible with both Deno and Node.js
const XUMM_API_KEY =
  typeof Deno !== "undefined" && typeof (Deno as any).env !== "undefined"
    ? (Deno as any).env.get("XUMM_API_KEY") || ""
    : process.env.XUMM_API_KEY || "";
const XUMM_API_SECRET =
  typeof Deno !== "undefined" && typeof (Deno as any).env !== "undefined"
    ? (Deno as any).env.get("XUMM_API_SECRET") || ""
    : process.env.XUMM_API_SECRET || "";
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
createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  try {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      const parsedBody = JSON.parse(body);

      const {
        ministerName,
        credentialId,
        roleTitle,
        issuedDate,
        supabaseUserId,
        minterAccount,
      } = parsedBody;

      if (
        !ministerName ||
        !credentialId ||
        !roleTitle ||
        !issuedDate ||
        !supabaseUserId ||
        !minterAccount
      ) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required fields" }));
        return;
      }

      const metadataUri = `https://example.com/metadata/${credentialId}.json`;

      try {
        const xummResponse = await mintNFTOnXumm(minterAccount, metadataUri);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, xummPayload: xummResponse }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}).listen(8000, () => {
  console.log("Server running on http://localhost:8000");
});
});
