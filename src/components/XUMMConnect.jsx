import React, { useState, useEffect } from 'react';
import XummSdk from 'xumm';
import QRCode from 'qrcode.react';
import { supabaseClient } from '../lib/supabaseClient';

const XUMMConnect = () => {
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

        // Save session to Supabase
        await saveSessionToSupabase(account, payload.uuid);

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

  const saveSessionToSupabase = async (account, uuid) => {
    try {
      const { data, error } = await supabase.from('xumm_sessions').insert([
        {
          wallet_address: account,
          payload_uuid: uuid,
          connected_at: new Date().toISOString(),
        },
      ]);
      if (error) {
        console.error('Error saving session to Supabase:', error);
      }
    } catch (err) {
      console.error('Exception saving session to Supabase:', err);
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
