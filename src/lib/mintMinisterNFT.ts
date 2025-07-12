import { supabaseClient } from './supabaseClient';

/**
 * Calls the Supabase Edge Function 'mintMinisterNFT' to mint an XLS-20 NFT credential on XRP Ledger.
 * 
 * @param ministerName - Name of the minister
 * @param credentialId - Unique credential ID
 * @param roleTitle - Role or title of the minister
 * @param issuedDate - ISO string of the issued date
 * @param supabaseUserId - Supabase user ID for cross-reference
 * @param minterAccount - XUMM wallet address of the minter
 * @returns The response from the Edge Function
 */
export async function mintMinisterNFT(
  ministerName: string,
  credentialId: string,
  roleTitle: string,
  issuedDate: string,
  supabaseUserId: string,
  minterAccount: string
) {
  try {
    const response = await supabaseClient.functions.invoke('mintMinisterNFT', {
      body: JSON.stringify({
        ministerName,
        credentialId,
        roleTitle,
        issuedDate,
        supabaseUserId,
        minterAccount,
      }),
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  } catch (error) {
    console.error('Error minting minister NFT:', error);
    throw error;
  }
}
