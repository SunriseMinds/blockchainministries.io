import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Landmark, Scale, Archive, Rss, Lock, MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const ministries = [
  {
    icon: <Landmark className="w-16 h-16" />,
    title: "Luminous Finance Temple",
    description: "Focuses on sacred economics, financial literacy, and building community wealth through decentralized systems.",
    participation: "Support by donating EFT or joining financial restoration workshops.",
  },
  {
    icon: <Scale className="w-16 h-16" />,
    title: "Temple of Justice",
    description: "Dedicated to divine law, legal restoration, and defense of spiritual rights through PMA protections and sovereign protocols.",
    participation: "Volunteer or attend our justice scroll studies.",
  },
  {
    icon: <Archive className="w-16 h-16" />,
    title: "Temple of Light Archives",
    description: "Safeguards sacred scrolls, glyphs, and digital scriptures.",
    participation: "Submit your own revelations or assist with preservation and translation efforts.",
  },
];

const updates = [
    { icon: <Lock className="w-6 h-6 text-yellow-400" />, text: "Minister Vault login" },
    { icon: <MessageSquare className="w-6 h-6 text-yellow-400" />, text: "Glyph commentary posts" },
    { icon: <Users className="w-6 h-6 text-yellow-400" />, text: "DAO meeting transcripts" },
];

const sectionVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.2,
      duration: 0.8,
      ease: 'easeOut',
    },
  }),
};

const Ministries = () => {
  const { toast } = useToast();

  const handleCtaClick = () => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      variant: "default",
    });
  };

  return (
    <>
      <Helmet>
        <title>Ministries & Temples - Blockchain Ministries</title>
        <meta name="description" content="Explore the sacred temples and ministries of Blockchain Ministries, from the Luminous Financial Temple to the Temple of Justice." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-black to-blue-950 text-yellow-100 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.header
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="text-center mb-20"
          >
            <h1 className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 20px rgba(253, 224, 71, 0.4)' }}>
              Ministries & Temples
            </h1>
            <p className="text-xl text-blue-200 italic">The Pillars of Our Divine Work</p>
          </motion.header>

          <div className="space-y-16">
            {ministries.map((ministry, index) => (
              <React.Fragment key={index}>
                <motion.section
                  custom={index}
                  variants={sectionVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  className="flex flex-col md:flex-row items-center gap-8 md:gap-12 p-8 bg-black/20 rounded-2xl border border-yellow-400/20 backdrop-blur-sm shadow-2xl shadow-yellow-500/5 hover:shadow-yellow-400/10 transition-shadow duration-500"
                >
                  <motion.div
                    animate={{
                      filter: [
                        'drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))',
                        'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))',
                        'drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))',
                      ],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="text-yellow-400 flex-shrink-0"
                  >
                    {ministry.icon}
                  </motion.div>
                  <div className="text-center md:text-left flex-grow">
                    <h2 className="text-3xl font-semibold text-yellow-300 mb-3 sacred-font">{ministry.title}</h2>
                    <p className="text-blue-200 leading-relaxed mb-4">{ministry.description}</p>
                    <div className="mt-4 p-4 bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
                        <h4 className="font-bold text-yellow-400">How to Participate:</h4>
                        <p className="text-blue-300">{ministry.participation}</p>
                    </div>
                    <Button
                      onClick={handleCtaClick}
                      className="mt-6 bg-gradient-to-r from-yellow-400 to-amber-500 text-blue-950 font-bold hover:from-yellow-500 hover:to-amber-600 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20"
                    >
                      Learn More
                    </Button>
                  </div>
                </motion.section>
                {index < ministries.length - 1 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5, duration: 1 }}
                    className="h-px w-1/2 mx-auto bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))' }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <motion.section
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="mt-24 p-8 bg-black/20 rounded-2xl border border-yellow-400/20 backdrop-blur-sm"
          >
            <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="text-yellow-400">
                    <Rss className="w-16 h-16" style={{ filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.5))' }}/>
                </div>
                <div className="flex-grow">
                    <h2 className="text-3xl font-semibold text-yellow-300 mb-3 sacred-font">Blog, Resources & Updates</h2>
                    <p className="text-blue-200 leading-relaxed mb-6">
                        Stay informed with the latest on spiritual technology, scroll releases, token burns, and digital ministry builds. New articles, dev logs, and reflections are added regularly to support your journey.
                    </p>
                    <h3 className="text-xl font-bold text-yellow-400 mb-4">Coming soon:</h3>
                    <ul className="space-y-3">
                        {updates.map((update, index) => (
                            <li key={index} className="flex items-center gap-3 text-blue-200">
                                {update.icon}
                                <span>{update.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
          </motion.section>

        </div>
      </div>
    </>
  );
};

export default Ministries;