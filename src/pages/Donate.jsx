
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, Heart, Repeat, Zap } from 'lucide-react';
import CryptoQRCode from './Donate/components/CryptoQRCode';
import TrustlineQRCode from '@/components/TrustlineQRCode';
import XUMMConnect from '@/components/XUMMConnect';

const Donate = () => {
  const { toast } = useToast();
  const [amount, setAmount] = useState(100);
  const [donationType, setDonationType] = useState('one-time');
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

  const handleNotImplemented = () => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry!",
      description: "You can request it in your next prompt! 🚀",
      variant: 'default',
      className: 'bg-blue-900 border-yellow-400 text-white',
    });
  };

  const cryptoAddresses = {
    XRP: 'rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw',
    BTC: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    ETH: '0x9eD2d4A4651152316975249922312dC25564D6A9',
  };

  return (
    <>
      <Helmet>
        <title>Donate & Support - Blockchain Ministries</title>
        <meta name="description" content="Support the Scroll. Every ministry gift is a covenant offering to protect truth, light, and sacred infrastructure." />
      </Helmet>
      <div className="text-white">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <Gift className="w-24 h-24 mx-auto text-yellow-400 mb-4 animate-pulse" />
          <h1 className="text-5xl md:text-6xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 15px rgba(251, 191, 36, 0.3)' }}>
            Support the Scroll
          </h1>
          <p className="text-lg md:text-xl text-blue-200 max-w-3xl mx-auto">
            Every ministry gift is a covenant offering to protect truth, light, and sacred infrastructure.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          <Card className="celestial-bg border-yellow-400/20 max-w-4xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl text-yellow-300 sacred-font">Make a Covenant Offering</CardTitle>
              <CardDescription className="text-blue-300">Your contribution fuels our divine mission.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="fiat" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 bg-blue-900/50 border border-yellow-400/20">
                  <TabsTrigger value="fiat" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">Tithe / Offering (USD)</TabsTrigger>
                  <TabsTrigger value="crypto" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">Embrace Digital Tithing</TabsTrigger>
                  <TabsTrigger value="connect" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300"><Zap className="w-4 h-4 mr-2"/>Connect Wallet</TabsTrigger>
                </TabsList>
                
                <TabsContent value="fiat" className="mt-6">
                  <Tabs defaultValue={donationType} onValueChange={setDonationType} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="one-time"><Heart className="mr-2 h-4 w-4" />One-Time</TabsTrigger>
                      <TabsTrigger value="recurring"><Repeat className="mr-2 h-4 w-4" />Recurring</TabsTrigger>
                    </TabsList>
                    <TabsContent value="one-time" className="space-y-6 pt-6">
                      <Label htmlFor="amount" className="text-yellow-300 sacred-font">Select Amount (USD)</Label>
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                          {[25, 50, 100, 250, 500, 1000].map(val => (
                              <Button key={val} variant={amount === val ? "default" : "outline"} onClick={() => setAmount(val)} className={`border-yellow-400/50 ${amount === val ? 'bg-yellow-500 text-blue-950 hover:bg-yellow-400' : 'text-yellow-300 hover:bg-yellow-400/10'}`}>
                                  ${val}
                              </Button>
                          ))}
                      </div>
                      <div className="flex items-center space-x-2">
                         <Input type="number" id="amount" placeholder="Custom Amount" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300" />
                      </div>
                       <Button onClick={handleNotImplemented} className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6">
                          Contribute with USD <Heart className="ml-2 w-5 h-5"/>
                      </Button>
                    </TabsContent>
                    <TabsContent value="recurring" className="space-y-6 pt-6 text-center">
                      <p className="text-blue-200">Set up a recurring offering to sustain our work.</p>
                      <Button onClick={handleNotImplemented} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold text-lg py-6">
                          Set Up Recurring Tithe <Repeat className="ml-2 w-5 h-5"/>
                      </Button>
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                <TabsContent value="crypto" className="mt-6">
                   <div className="space-y-8 text-center">
                        <div className="max-w-md mx-auto">
                            <TrustlineQRCode
                              trustlineUrl={trustlineUrl}
                              buttonText="Set TrustLine / Donate EFT"
                              title="Donate with Esoteric Freedom Token (EFT)"
                              description="First, set the TrustLine in your XUMM wallet to hold EFT. Then donate XRP to our address to receive EFT."
                            />
                        </div>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-yellow-400/20" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-blue-950/80 px-4 text-sm text-blue-300 backdrop-blur-sm">Or Donate Other Crypto</span>
                            </div>
                        </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <CryptoQRCode assetName="XRP" address={cryptoAddresses.XRP} />
                        <CryptoQRCode assetName="Bitcoin (BTC)" address={cryptoAddresses.BTC} />
                        <CryptoQRCode assetName="Ethereum (ETH)" address={cryptoAddresses.ETH} />
                      </div>
                   </div>
                </TabsContent>

                <TabsContent value="connect" className="mt-6">
                  <div className="flex justify-center">
                    <div className="w-full max-w-md">
                      <XUMMConnect />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Donate;