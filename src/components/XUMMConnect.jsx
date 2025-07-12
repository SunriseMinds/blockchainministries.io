import React, { useEffect, useState } from 'react';
import { Xumm } from 'xumm';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Zap } from 'lucide-react';
import QRCode from 'qrcode.react';

const xumm = new Xumm(import.meta.env.VITE_XUMM_API_KEY);

export default function XUMMConnect() {
  const [user, setUser] = useState(null);
  const [authUrl, setAuthUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const connect = async () => {
      setIsLoading(true);
      try {
        const { uuid, next, refs } = await xumm.authorize();
        setAuthUrl(next.always);
        setQrCodeUrl(refs.qr_png);

        xumm.on("success", async () => {
          const state = await xumm.state();
          setUser(state.me);
          setIsConnected(true);
          setIsLoading(false);
          try {
            await supabase
              .from('xumm_sessions')
              .insert([{ uuid, wallet_address: state.me.account }]);
          } catch (e) {
            console.error('Supabase save error:', e);
          }
        });

        xumm.on("rejected", () => {
            setIsLoading(false);
            setAuthUrl('');
            setQrCodeUrl('');
            connect();
        });
        
        setIsLoading(false);

      } catch (error) {
        console.error('XUMM Connect Error:', error);
        setIsLoading(false);
      }
    };
    connect();

    return () => {
      xumm.off("success");
      xumm.off("rejected");
    }
  }, []);

  return (
    <Card className="celestial-bg border-yellow-400/20 w-full text-white">
      <CardHeader>
        <CardTitle className="flex items-center text-yellow-300 sacred-font">
          <Zap className="w-6 h-6 mr-2 animate-pulse" />
          XRPL Wallet Connection
        </CardTitle>
        <CardDescription className="text-blue-300">
          Connect your XUMM wallet to interact with our sacred offerings.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 text-center">
        <AnimatePresence mode="wait">
          {isConnected ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="text-green-400 space-y-4"
            >
              <CheckCircle className="w-16 h-16 mx-auto" />
              <h2 className="text-2xl font-bold sacred-font">Wallet Connected!</h2>
              <p className="mt-2 text-sm text-green-200 break-all">Address: {user?.account}</p>
            </motion.div>
          ) : (
            <motion.div
              key="not-connected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
                    <p className="mt-4 text-blue-200">Awaiting Connection...</p>
                </div>
              ) : (
                <>
                  <p className="text-blue-200">Scan with XUMM or click the button below.</p>
                  {qrCodeUrl && (
                    <div className="bg-white p-4 rounded-lg inline-block shadow-lg shadow-yellow-400/20">
                      <QRCode value={qrCodeUrl} size={160} />
                    </div>
                  )}
                  {authUrl && (
                    <Button asChild className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold text-lg py-6">
                      <a href={authUrl} target="_blank" rel="noopener noreferrer">
                        Connect via XUMM
                      </a>
                    </Button>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
