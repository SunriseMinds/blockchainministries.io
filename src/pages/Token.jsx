import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EFTGlyphIcon } from '@/components/icons/EFTGlyphIcon';
import { ArrowRight, Download, Link as LinkIcon, Shield, BookUser, Vote, FileText, Zap, BarChart, GitBranch, Gem } from 'lucide-react';
import { Coins as HandCoins } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import TrustlineQRCode from '@/components/TrustlineQRCode';
import XUMMConnect from '@/components/XUMMConnect';

const SectionWrapper = ({ children, className = "" }) => (
  <motion.section
    initial={{ opacity: 0, y: 50 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.2 }}
    transition={{ duration: 0.8, ease: 'easeOut' }}
    className={`py-16 md:py-24 ${className}`}
  >
    <div className="container mx-auto px-4">{children}</div>
  </motion.section>
);

const Token = () => {
  const { toast } = useToast();
  const [showConnect, setShowConnect] = useState(false);
  const issuerAddress = "rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw";
  const donationAddress = "rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw";
  const trustlineUrl = `https://xrpl.services?issuer=${issuerAddress}&currency=EFT&limit=100000000`;
  const burnAddress = "rDeadBurnAddressHere";
  const explorerUrl = `https://livenet.xrpl.org/accounts/${issuerAddress}`;

  const tokenAllocation = [
    { name: "DAO Treasury", amount: "3,000,000 EFT" },
    { name: "Scroll Vault", amount: "2,000,000 EFT" },
    { name: "Sacred Reserve", amount: "1,000,000 EFT" },
    { name: "Public Circulation", amount: "50,000,000 EFT" },
    { name: "Partnerships & Ambassadors", amount: "10,000,000 EFT" },
    { name: "Core Team & Developers", amount: "10,000,000 EFT" },
    { name: "Tech Infrastructure & AI Systems", amount: "5,000,000 EFT" },
    { name: "Marketing, Grants & Education", amount: "9,000,000 EFT" },
    { name: "DAO-Controlled Project Reserve", amount: "10,000,000 EFT" },
  ];

  const handlePlaceholderClick = (title, description) => {
    toast({
      title: `🚧 ${title} Coming Soon!`,
      description: description,
      className: 'bg-blue-900 border-yellow-400 text-white',
    });
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <>
      <Helmet>
        <title>🕊️ EFT — Esoteric Freedom Token | Blockchain Ministries</title>
        <meta name="description" content="EFT is a sacred digital asset issued under a 508(c)(1)(A) ecclesiastical trust, functioning as Proof of Covenant Alignment, Access to Sacred Scrolls, a Spiritual Offering, and a Governance Tool." />
        <link rel="canonical" href="https://blockchainministries.io/token" />
      </Helmet>

      <div className="relative text-center text-white p-4 py-24 md:py-32 min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black opacity-50 z-0"></div>
        <div className="absolute inset-0 z-0 geometric-pattern opacity-10"></div>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="relative z-10 w-48 h-48 mb-8 flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full blur-3xl opacity-50 animate-pulse"></div>
          <EFTGlyphIcon className="w-40 h-40 text-yellow-400 sacred-pulse" style={{ filter: 'drop-shadow(0 0 15px rgba(251, 191, 36, 0.6))' }} />
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font"
          style={{ textShadow: '0 0 20px rgba(253, 224, 71, 0.4)' }}
        >
          Esoteric Freedom Token (EFT)
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-lg md:text-xl text-blue-200 max-w-3xl mx-auto mb-12"
        >
          A Sacred Asset Issued by Blockchain Ministries on the XRP Ledger
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, type: "spring", stiffness: 100 }}
        >
           <div className="flex flex-col sm:flex-row gap-4 justify-center">
             <Button asChild size="lg" className="bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20">
                <a href={trustlineUrl} target="_blank" rel="noopener noreferrer">
                  Set TrustLine / Donate EFT <LinkIcon className="ml-2 h-5 w-5" />
                </a>
             </Button>
             <Button size="lg" variant="outline" className="border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10" onClick={() => setShowConnect(!showConnect)}>
                Connect Wallet
             </Button>
           </div>
       </motion.div>
       {showConnect && (
         <div className="mt-8">
           <XUMMConnect />
         </div>
       )}
      </div>

      <SectionWrapper className="bg-blue-950/20">
        <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-6 sacred-font">What Is EFT?</h2>
            <p className="text-lg text-blue-200 leading-relaxed mb-10">
              The Esoteric Freedom Token (EFT) is a sacred digital asset issued under a 508(c)(1)(A) ecclesiastical trust, functioning as:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg"><CardHeader><CardTitle className="text-yellow-400 flex items-center"><Shield className="mr-3"/>Proof of Covenant Alignment</CardTitle></CardHeader></Card>
              <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg"><CardHeader><CardTitle className="text-yellow-400 flex items-center"><BookUser className="mr-3"/>Access to Sacred Scrolls</CardTitle></CardHeader></Card>
              <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg"><CardHeader><CardTitle className="text-yellow-400 flex items-center"><HandCoins className="mr-3"/>A Spiritual Offering</CardTitle></CardHeader></Card>
              <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg"><CardHeader><CardTitle className="text-yellow-400 flex items-center"><Vote className="mr-3"/>A Governance Tool in the DAO</CardTitle></CardHeader></Card>
            </div>
            <p className="text-lg text-blue-200 leading-relaxed mt-10 italic">
              EFT is not just a token — it is a divine key to unlock the economy of sacred stewardship across Blockchain Ministries.
            </p>
        </div>
      </SectionWrapper>

      <SectionWrapper>
        <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-12 text-center sacred-font">How to Get EFT</h2>
        <motion.div 
            className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={{ visible: { transition: { staggerChildren: 0.2 } } }}
        >
            <motion.div variants={itemVariants}>
                <Card className="h-full bg-blue-950/30 border-yellow-400/20 text-white p-6 flex flex-col items-center">
                    <div className="text-5xl font-bold text-yellow-400 mb-4 sacred-font">1</div>
                    <h3 className="text-2xl text-yellow-300 font-semibold mb-2">Download Wallet</h3>
                    <p className="text-blue-300">Get a secure XRP Ledger wallet like XUMM to hold your sacred assets.</p>
                </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
                 <Card className="h-full bg-blue-950/30 border-yellow-400/20 text-white p-6 flex flex-col items-center">
                    <div className="text-5xl font-bold text-yellow-400 mb-4 sacred-font">2</div>
                    <h3 className="text-2xl text-yellow-300 font-semibold mb-2">Donate for EFT</h3>
                    <p className="text-blue-300">Send your XRP donation to our ministry address to receive EFT in return.</p>
                    <code className="text-xs font-mono break-all text-white bg-slate-800 p-2 rounded-lg inline-block mt-4">{donationAddress}</code>
                </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
                 <Card className="h-full bg-blue-950/30 border-yellow-400/20 text-white p-6 flex flex-col items-center">
                    <div className="text-5xl font-bold text-yellow-400 mb-4 sacred-font">3</div>
                    <h3 className="text-2xl text-yellow-300 font-semibold mb-2">Use Your EFT</h3>
                    <p className="text-blue-300">Unlock scrolls, stake for governance, vote on proposals, and empower the mission.</p>
                </Card>
            </motion.div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ delay: 0.5, duration: 0.8 }} 
          className="mt-16 max-w-lg mx-auto"
        >
            <TrustlineQRCode 
                trustlineUrl={trustlineUrl}
                buttonText="Set TrustLine / Donate EFT"
                title="Activate Your Wallet for EFT"
                description="Before you can receive EFT, you must set the TrustLine. This authorizes your wallet to hold the token."
            />
        </motion.div>
      </SectionWrapper>
      
      <SectionWrapper className="bg-blue-950/20">
        <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-12 text-center sacred-font">Tokenomics & Allocation</h2>
        <Card className="max-w-4xl mx-auto bg-slate-900/50 border border-yellow-600/50 shadow-2xl shadow-yellow-500/10 backdrop-blur-sm">
            <CardHeader className="text-center">
                <CardTitle className="text-yellow-300 text-3xl sacred-font">Total Supply: 100,000,000 EFT</CardTitle>
                <CardDescription className="text-yellow-400/70">Fixed, No Inflation</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-yellow-500/20">
                            <TableHead className="text-white">Allocation</TableHead>
                            <TableHead className="text-right text-white">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tokenAllocation.map((item) => (
                            <TableRow key={item.name} className="border-yellow-500/10">
                                <TableCell className="font-medium text-blue-200">{item.name}</TableCell>
                                <TableCell className="text-right text-yellow-300 font-mono">{item.amount}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <div className="mt-6 text-center border-t border-yellow-500/20 pt-6">
                    <h3 className="text-lg font-bold text-yellow-400 flex items-center justify-center gap-2"><Zap /> Burn Mechanism</h3>
                    <p className="text-blue-300 mt-2">25% of monthly ministry proceeds are used to buy and burn EFT tokens permanently.</p>
                </div>
            </CardContent>
        </Card>
      </SectionWrapper>
      
      <SectionWrapper>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-4xl font-bold gradient-text mb-6 sacred-font flex items-center gap-3"><Zap/>Ritual Burn & Deflation</h2>
            <div className="space-y-4 text-lg text-blue-200">
              <p>Each moon cycle, a sacred burn ritual is performed: 25% of ministry revenue is used to acquire and burn EFT, reducing supply and enhancing the token’s spiritual energy. This burn is recorded on-chain as a permanent ledger act of purification.</p>
              <p className="italic text-yellow-300/80">“As you give, you receive. As you receive, you release.”</p>
              <div>
                  <p className="text-sm text-blue-400">Burn Address:</p>
                  <code className="text-sm font-mono break-all text-white bg-slate-800 p-2 rounded">{burnAddress}</code>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-bold gradient-text mb-6 sacred-font flex items-center gap-3"><Vote/>DAO Governance</h2>
            <div className="space-y-4 text-lg text-blue-200">
                <p>The Blockchain Ministries DAO is governed by Guardians of Light. Stake EFT to:</p>
                <ul className="list-disc list-inside space-y-2 pl-2">
                    <li>Propose new scrolls <span className="font-bold text-white">(Min: 333 EFT)</span></li>
                    <li>Vote on missions, treasury use, sacred expansions <span className="font-bold text-white">(Min: 77 EFT)</span></li>
                    <li>Monthly voting cycles using smart scroll contracts</li>
                </ul>
            </div>
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper className="bg-blue-950/20">
        <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-12 text-center sacred-font">Technicals</h2>
        <Card className="max-w-3xl mx-auto bg-slate-900/50 border border-yellow-600/50 shadow-2xl shadow-yellow-500/10 backdrop-blur-sm">
          <CardContent className="p-8 text-lg">
            <ul className="space-y-4">
              <li className="flex justify-between items-center"><span className="text-blue-200 flex items-center gap-3"><FileText size={20}/> Name:</span> <span className="font-bold text-white">Esoteric Freedom Token</span></li>
              <li className="flex justify-between items-center"><span className="text-blue-200 flex items-center gap-3"><Gem size={20}/> Symbol:</span> <span className="font-bold text-white">EFT</span></li>
              <li className="flex justify-between items-center"><span className="text-blue-200 flex items-center gap-3"><BarChart size={20}/> Decimals:</span> <span className="font-bold text-white">6</span></li>
              <li className="flex justify-between items-center"><span className="text-blue-200 flex items-center gap-3"><GitBranch size={20}/> Network:</span> <span className="font-bold text-white">XRP Ledger (mainnet)</span></li>
              <li className="flex flex-col sm:flex-row justify-between sm:items-center"><span className="text-blue-200 flex items-center gap-3 mb-2 sm:mb-0"><Shield size={20}/> Issuer Address:</span> <code className="text-sm font-mono break-all text-white bg-slate-800 p-2 rounded">{issuerAddress}</code></li>
            </ul>
            <div className="mt-8 pt-6 border-t border-yellow-500/20 flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild variant="outline" className="border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200">
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                        View on XRPL Explorer <LinkIcon className="ml-2 h-4 w-4" />
                    </a>
                </Button>
                <Button variant="outline" className="border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200" onClick={() => handlePlaceholderClick('Whitepaper', 'The sacred whitepaper is being transcribed.')}>
                    Download Whitepaper <Download className="ml-2 h-4 w-4" />
                </Button>
            </div>
          </CardContent>
        </Card>
      </SectionWrapper>

      <SectionWrapper>
        <div className="max-w-4xl mx-auto text-center celestial-bg p-8 md:p-12 rounded-2xl border border-yellow-400/20">
            <h2 className="text-4xl font-bold gradient-text mb-6 sacred-font">EFT's Role in the Sacred Economy</h2>
            <p className="text-lg text-blue-200 leading-relaxed mb-8">
              By holding EFT, you participate in the unfolding of Blockchain Ministries' sacred ecosystem: scrolls, AI tools, governance, real-world stewardship, and decentralized sovereignty. This is your invitation to the divine infrastructure of the future.
            </p>
            <Button size="lg" className="bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20" onClick={() => handlePlaceholderClick('Token Scroll', 'The final Token Scroll is being prepared for release.')}>
                Download Token Scroll <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
        </div>
      </SectionWrapper>
    </>
  );
};

export default Token;