import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, Zap, Gem, Shield, Crown, BookOpen, Vote } from 'lucide-react';
import CryptoQRCode from './Donate/components/CryptoQRCode';
import StripeTiers from './Donate/components/StripeTiers';
import PaypalDonate from './Donate/components/PaypalDonate';

const Donate = () => {
  const cryptoAddresses = {
    XRP: 'rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw',
  };

  const benefits = [
    {
      icon: Gem,
      title: 'Receive EFT Rewards',
      description: 'Gain Esoteric Freedom Tokens (EFT) with every contribution, empowering you within our ecosystem.',
    },
    {
      icon: BookOpen,
      title: 'Access Sacred Scrolls',
      description: 'Unlock exclusive access to our growing library of sacred texts, research, and divine knowledge.',
    },
    {
      icon: Vote,
      title: 'DAO Governance Rights',
      description: 'Participate in the future of the ministry by voting on key proposals and directives.',
    },
  ];

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
          className="text-center mb-12"
        >
          <Gift className="w-24 h-24 mx-auto text-yellow-400 mb-4 sacred-pulse" />
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
          <Card className="celestial-bg border-yellow-400/20 max-w-5xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl text-yellow-300 sacred-font">Make a Covenant Offering</CardTitle>
              <CardDescription className="text-blue-300">Choose your path of contribution and reap the rewards.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="tiers" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-blue-900/50 border border-yellow-400/20">
                  <TabsTrigger value="tiers" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300"><Gem className="w-4 h-4 mr-2" />Tiers</TabsTrigger>
                  <TabsTrigger value="paypal" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300">One-Time</TabsTrigger>
                  <TabsTrigger value="crypto" className="data-[state=active]:bg-yellow-400/10 data-[state=active]:text-yellow-300"><Zap className="w-4 h-4 mr-2" />Crypto</TabsTrigger>
                </TabsList>
                
                <TabsContent value="tiers" className="mt-8">
                  <StripeTiers />
                </TabsContent>

                <TabsContent value="paypal" className="mt-8">
                  <PaypalDonate />
                </TabsContent>

                <TabsContent value="crypto" className="mt-8">
                   <div className="space-y-8 text-center">
                      <div className="grid grid-cols-1 gap-6 max-w-md mx-auto">
                        <CryptoQRCode assetName="XRP" address={cryptoAddresses.XRP} />
                      </div>
                   </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        <motion.section 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 max-w-5xl mx-auto"
        >
          <h2 className="text-4xl text-center font-bold text-yellow-300 mb-10 sacred-font">Benefits of Your Covenant</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.2 }}
              >
                <Card className="celestial-bg border-yellow-400/20 h-full text-center p-6">
                  <CardHeader>
                    <div className="w-16 h-16 bg-yellow-400/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-yellow-400/30">
                      <benefit.icon className="w-8 h-8 text-yellow-400" />
                    </div>
                    <CardTitle className="text-2xl text-yellow-300 sacred-font">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-blue-300">{benefit.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </>
  );
};
export default Donate;