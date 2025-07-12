import React, { useState, useEffect } from 'react';
import XummSdk from 'xumm';
import QRCode from 'qrcode.react';
import { useSupabase } from '../hooks/useSupabase';

const XUMMConnect = () => {
  const supabase = useSupabase();

  const [xumm, setXumm] = useState(null);
  const [payloadUuid, setPayloadUuid] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Initialize Xumm SDK with API key and secret from environment variables
    const apiKey = import.meta.env.VITE_XUMM_API_KEY;
    const apiSecret = import.meta.env.VITE_XUMM_API_SECRET;

    if (!apiKey || !apiSecret) {
      setError('Missing XUMM API key or secret in environment variables.');
      return;
    }

    const sdk = new XummSdk(apiKey, apiSecret);
    setXumm(sdk);
  }, []);

  const createPayload = async () => {
    if (!xumm) {
      setError('Xumm SDK not initialized.');
      return;
    }
    setError(null);
    setConnecting(true);

    try {
      // Create a payload for sign-in (arbitrary transaction to request user signature)
      const payload = await xumm.payload.create({
        txjson: {
          TransactionType: 'SignIn',
        },
        options: {
          submit: false,
        },
      });

      setPayloadUuid(payload.uuid);

      // Wait for the user to sign the payload
      const resolved = await xumm.payload.get(payload.uuid, { expand: true });

      if (resolved.meta.signed) {
        const account = resolved.response.account;
        setWalletAddress(account);

        // Save session to Supabase and sign in user
        await handleUserSignIn(account, payload.uuid);

        setConnecting(false);
      } else {
        setError('User declined the connection.');
        setConnecting(false);
      }
    } catch (err) {
      setError('Error creating or resolving payload: ' + err.message);
      setConnecting(false);
    }
  };

  const handleUserSignIn = async (account, uuid) => {
    try {
      // Save session to xumm_sessions table
      const { error: sessionError } = await supabase.from('xumm_sessions').insert([
        {
          wallet_address: account,
          payload_uuid: uuid,
          connected_at: new Date().toISOString(),
        },
      ]);
      if (sessionError) {
        console.error('Error saving session to Supabase:', sessionError);
      }

      // Check if user is already signed in
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // Sign in anonymously if no session exists
        const { data, error } = await supabase.auth.signInWithOtp({
          email: `${account}@xumm.wallet`, // Using wallet address as email placeholder
        });

        if (error) {
          console.error('Error signing in with OTP:', error);
          setError('Authentication failed: ' + error.message);
          return;
        }
      }

      // Update user metadata with wallet address
      const { error: updateError } = await supabase.auth.updateUser({
        data: { wallet_address: account },
      });

      if (updateError) {
        console.error('Error updating user metadata:', updateError);
      }
    } catch (err) {
      console.error('Exception in handleUserSignIn:', err);
      setError('Authentication error: ' + err.message);
    }
  };

  return (
    <div className="xumm-connect">
      {!walletAddress && (
        <>
          <button
            onClick={createPayload}
            disabled={connecting}
            className="btn btn-primary"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {payloadUuid && (
            <div className="qr-code">
              <QRCode
                value={`https://xumm.app/sign/${payloadUuid}`}
                size={256}
                level="H"
                includeMargin={true}
              />
              <p>Scan the QR code with your XUMM Wallet to connect.</p>
            </div>
          )}
        </>
      )}
      {walletAddress && (
        <div>
          <p>Connected Wallet Address:</p>
          <code>{walletAddress}</code>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default XUMMConnect;
