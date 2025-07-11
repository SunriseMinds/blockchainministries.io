import React, { useEffect, useState } from 'react';

const XUMMConnect = () => {
  const [account, setAccount] = useState(null);

  useEffect(() => {
    const connectXumm = async () => {
      const { xumm } = await import('xumm-sdk');
      const Sdk = xumm.default;
      const xummSdk = new Sdk(import.meta.env.VITE_XUMM_API_KEY);

      const payload = await xummSdk.payload.create({
        txjson: {
          TransactionType: 'SignIn',
        },
      });

      window.open(payload.next.always, '_blank');
    };

    if (!account) connectXumm();
  }, [account]);

  return (
    <div className="text-center mt-8">
      {account ? (
        <div>
          <p className="text-green-600">Connected XRPL Wallet:</p>
          <p className="font-mono">{account}</p>
        </div>
      ) : (
        <p>Connecting to XUMM...</p>
      )}
    </div>
  );
};

export default XUMMConnect;
