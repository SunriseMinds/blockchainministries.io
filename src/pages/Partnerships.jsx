import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Building, Gem, FileText, Link as LinkIcon, CheckCircle, HeartHandshake, Quote, HeartHandshake as Handshake } from 'lucide-react';
import AnimatedSacredSymbol from '@/pages/Partnerships/components/AnimatedSacredSymbol';

const Partnerships = () => {
  const { toast } = useToast();

  const handleNotImplemented = (feature) => {
    toast({
      title: `🚧 ${feature} Not Implemented`,
      description: "This feature isn't available yet, but you can request it in your next prompt! 🚀",
      variant: 'default',
      className: 'bg-blue-900 border-yellow-400 text-white',
    });
  };

  const partnershipCategories = [
    {
      icon: Building,
      title: 'Institutional Partners',
      description: 'Faith-based trusts, sovereign embassies, spiritual universities, or legacy families seeking collaboration on land, restoration, or sacred scroll work.',
    },
    {
      icon: ShieldCheck,
      title: 'Diplomatic Affiliates',
      description: 'Ecclesiastical bodies, indigenous councils, and sovereign embassies aligned with 508(c)(1)(A) protections and mutual recognition protocols.',
    },
    {
      icon: HeartHandshake,
      title: 'Ministry Affiliates',
      description: 'Wellness centers, educational platforms, and aligned businesses who wish to support our mission and receive reciprocal visibility, referrals, or legal covering.',
    },
  ];

  const covenantExpectations = [
    'Uphold sacred trust values (truth, transparency, stewardship)',
    'Abide by our non-commercial, faith-first ethos',
    'Operate with integrity and clarity in all public representations',
  ];

  const resources = [
    { title: 'Download Affiliate Scroll (PDF)', icon: FileText, action: () => handleNotImplemented('Affiliate Scroll Download') },
    { title: 'Review Sacred Terms of Exchange', icon: LinkIcon, action: () => handleNotImplemented('Terms of Exchange') },
    { title: 'Submit W-9 Equivalent', icon: FileText, action: () => handleNotImplemented('W-9 Submission') },
    { title: 'View Public Ministry Recognition Ledger', icon: LinkIcon, action: () => handleNotImplemented('Recognition Ledger') },
  ];

  return (
    <>
      <Helmet>
        <title>Partnerships & Affiliates - Blockchain Ministries</title>
        <meta name="description" content="Divine Alignment Through Sacred Alliance. We welcome strategic alliances that align with the divine mission of Blockchain Ministries." />
      </Helmet>
      <div className="p-4 text-white relative overflow-hidden">
        <div className="absolute inset-0 geometric-pattern opacity-10"></div>
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-yellow-400/10 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-blue-400/10 rounded-full filter blur-3xl animate-pulse animation-delay-2000"></div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-16 relative z-10"
        >
          <AnimatedSacredSymbol />
          <h1 className="text-5xl md:text-6xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 15px rgba(251, 191, 36, 0.3)' }}>
            Divine Alignment Through Sacred Alliance
          </h1>
          <p className="text-lg md:text-xl text-blue-200 max-w-3xl mx-auto">
            We welcome strategic alliances that align with the divine mission of Blockchain Ministries. Together, we restore, redeem, and build temples of trust.
          </p>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mb-16 relative z-10 max-w-3xl mx-auto"
        >
            <Card className="celestial-bg border-yellow-400/30 p-8">
                <CardContent className="p-0 text-center">
                    <Quote className="w-12 h-12 text-yellow-500/20 mx-auto mb-4" />
                    <blockquote className="text-2xl italic text-yellow-200 mb-4">
                        “Working with Blockchain Ministries amplified our mission and anchored us in divine digital trust.”
                    </blockquote>
                    <p className="font-bold text-yellow-400 sacred-font">— Sovereign DAO Council</p>
                </CardContent>
            </Card>
        </motion.section>

        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-16 relative z-10"
        >
          <h2 className="text-4xl font-bold text-center mb-4 sacred-font text-yellow-300">Our Honored Partners</h2>
          <p className="text-center text-blue-200 max-w-3xl mx-auto mb-10">
            We are honored to partner with spiritual organizations, DAOs, and technology allies. Each partner will have a logo and short bio listed to show collective strength and divine unity.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[...Array(4)].map((_, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="celestial-bg h-32 flex flex-col items-center justify-center text-center p-6 rounded-lg border border-yellow-400/20"
              >
                <Handshake className="w-8 h-8 text-yellow-400/50 mb-2" />
                <p className="text-blue-300/70 text-sm">Partner Logo</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-16 relative z-10"
        >
          <h2 className="text-4xl font-bold text-center mb-10 sacred-font text-yellow-300">Partnership Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {partnershipCategories.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                <Card className="celestial-bg h-full flex flex-col text-center p-6 hover:border-yellow-400/50 transition-all duration-300 hover:shadow-2xl hover:shadow-yellow-400/10">
                  <CardHeader className="items-center">
                    <div className="p-4 bg-yellow-400/10 rounded-full mb-4">
                      <category.icon className="w-10 h-10 text-yellow-400" />
                    </div>
                    <CardTitle className="text-2xl text-yellow-300 sacred-font">{category.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-blue-200">
                    {category.description}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mb-16 relative z-10"
        >
          <Card className="celestial-bg border-yellow-400/20">
            <div className="grid md:grid-cols-2 items-center">
              <div className="p-8">
                <Gem className="w-12 h-12 text-yellow-400 mb-4" />
                <h3 className="text-3xl sacred-font text-yellow-300 mb-4">Affiliate Circle (Tokenized Tier)</h3>
                <ul className="space-y-2 text-blue-200">
                  <li className="flex items-center"><CheckCircle className="w-5 h-5 mr-2 text-yellow-400" /> Earn honorariums and digital commissions.</li>
                  <li className="flex items-center"><CheckCircle className="w-5 h-5 mr-2 text-yellow-400" /> Access affiliate dashboard (coming soon).</li>
                  <li className="flex items-center"><CheckCircle className="w-5 h-5 mr-2 text-yellow-400" /> Share sacred tools with affiliate tracking.</li>
                </ul>
              </div>
              <div className="p-8 bg-yellow-400/5 rounded-r-lg h-full flex items-center justify-center">
                <Button onClick={() => handleNotImplemented('Affiliate Circle')} size="lg" className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6">
                  Join the Affiliate Circle
                </Button>
              </div>
            </div>
          </Card>
        </motion.section>

        <div className="grid md:grid-cols-2 gap-16 mb-16 relative z-10">
          <motion.section
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl font-bold mb-6 sacred-font text-yellow-300">Covenant Expectations</h2>
            <ul className="space-y-4">
              {covenantExpectations.map((item, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                  <span className="text-blue-200">{item}</span>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl font-bold mb-6 sacred-font text-yellow-300">How to Become a Partner</h2>
            <ol className="space-y-4 list-decimal list-inside text-blue-200 marker:text-yellow-400 marker:font-bold">
              <li>Submit your intent via the Covenant Partner form below.</li>
              <li>Schedule a spiritual alignment call with the Guardian Council.</li>
              <li>Receive your official scroll of partnership and digital seal.</li>
              <li>Optionally be listed on the Global Allies Page.</li>
            </ol>
            <Button onClick={() => handleNotImplemented('Partnership Application')} size="lg" className="mt-8 w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6">
              Apply for Partnership
            </Button>
          </motion.section>
        </div>

        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <h2 className="text-4xl font-bold text-center mb-10 sacred-font text-yellow-300">Resources & Agreements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {resources.map((resource, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <button onClick={resource.action} className="w-full h-full text-left celestial-bg p-6 rounded-2xl flex items-center space-x-4 transition-all duration-300 hover:bg-yellow-400/10 hover:shadow-lg hover:shadow-yellow-400/10">
                  <resource.icon className="w-8 h-8 text-yellow-400 flex-shrink-0" />
                  <span className="text-yellow-200 font-semibold">{resource.title}</span>
                </button>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </>
  );
};

export default Partnerships;