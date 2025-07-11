import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode.react';
import { Client } from 'xrpl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const TokenBalancePanel = ({ ministerData }) => {
  const { toast } = useToast();
  const [balance, setBalance] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const [trustlineActive, setTrustlineActive] = useState(false);

  const walletAddress = ministerData?.walletAddress;
  const issuerAddress = 'rYourIssuerAddressHere';
  const currencyCode = 'EFT';

  useEffect(() => {
    if (!walletAddress) return;

    const fetchBalance = async () => {
      setLoading(true);
      const client = new Client('wss://s.altnet.rippletest.net:51233'); // Testnet
      try {
        await client.connect();
        const response = await client.request({
          command: 'account_lines',
          account: walletAddress,
          ledger_index: 'validated',
        });

        const eftLine = response.result.lines.find(
          (line) => line.currency === currencyCode && line.account === issuerAddress
        );

        if (eftLine) {
          setBalance(eftLine.balance);
          setTrustlineActive(true);
        } else {
          setBalance('0.00');
          setTrustlineActive(false);
        }
      } catch (error) {
        console.error('Error fetching XRPL balance:', error);
        setBalance('Error');
        setTrustlineActive(false);
        toast({
          title: "XRPL Connection Error",
          description: "Could not fetch token balance. The ledger may be busy.",
          variant: "destructive",
        });
      } finally {
        await client.disconnect();
        setLoading(false);
      }
    };

    fetchBalance();
  }, [walletAddress, toast]);

  const handleNotImplemented = () => {
    toast({
      title: "Feature Inscription Pending",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      variant: "destructive",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg w-full">
        <CardHeader>
          <CardTitle className="text-yellow-400 text-2xl flex items-center">
            <Coins className="mr-3" />
            EFT Token Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center p-4 bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-300">Current Balance</p>
            {loading ? (
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-yellow-400" />
            ) : (
              <p className="text-4xl font-bold text-yellow-400 sacred-font">{balance}</p>
            )}
            <p className="text-yellow-500">EFT</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-grow space-y-2">
              <div>
                <p className="text-sm text-blue-300">Wallet Address</p>
                <p className="text-xs font-mono text-yellow-200 break-all">{walletAddress || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-blue-300">Trustline Status</p>
                {trustlineActive ? (
                  <div className="flex items-center gap-2 text-green-400 font-bold">
                    <CheckCircle className="w-4 h-4" /> Active
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-yellow-400 font-bold">
                    <AlertCircle className="w-4 h-4" /> Inactive
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white p-1 rounded-md flex-shrink-0">
              <QRCode value={walletAddress || ''} size={80} bgColor="#ffffff" fgColor="#0A192F" level="L" />
            </div>
          </div>

          {!trustlineActive && !loading && (
            <Button className="w-full bg-yellow-600 text-black font-bold hover:bg-yellow-500" onClick={handleNotImplemented}>
              Add Trustline
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default TokenBalancePanel;