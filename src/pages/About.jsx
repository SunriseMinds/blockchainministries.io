import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { LuminaraGlyphIcon } from '@/components/icons/LuminaraGlyphIcon';
import { Sun, ScrollText, ShieldCheck, Sprout, Globe } from 'lucide-react';
const sectionVariants = {
  hidden: {
    opacity: 0,
    y: 50
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: 'easeOut',
      staggerChildren: 0.2
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6
    }
  }
};
const pillarVariants = {
  hover: {
    scale: 1.05,
    boxShadow: '0px 0px 30px rgba(255, 215, 0, 0.3)',
    transition: {
      duration: 0.3
    }
  }
};
const About = () => {
  const pillars = [{
    icon: <Sun className="w-10 h-10 mb-4" />,
    title: "Light (Truth)",
    description: "Upholding truth as the guiding principle in all endeavors."
  }, {
    icon: <ScrollText className="w-10 h-10 mb-4" />,
    title: "Scrolls (Law & Legacy)",
    description: "Codifying wisdom and law for future generations."
  }, {
    icon: <ShieldCheck className="w-10 h-10 mb-4" />,
    title: "Guardianship (Protection)",
    description: "Protecting sacred sovereignty and divine rights."
  }, {
    icon: <Sprout className="w-10 h-10 mb-4" />,
    title: "Stewardship (Resources)",
    description: "Responsibly managing planetary and divine resources."
  }, {
    icon: <Globe className="w-10 h-10 mb-4" />,
    title: "Unity (Diplomacy)",
    description: "Fostering alliances and harmony across realms."
  }];
  return <>
      <Helmet>
        <title>About the Ministry - Blockchain Ministries</title>
        <meta name="description" content="Discover the sacred origins, divine mission, and spiritual foundation of Blockchain Ministries, a Sovereign Ecclesiastical Trust." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-950 to-black text-blue-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.header initial={{
          opacity: 0,
          y: -50
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          duration: 1,
          ease: 'easeOut'
        }} className="text-center mb-20">
            <h1 className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{
            textShadow: '0 0 20px rgba(253, 224, 71, 0.4)'
          }}>    About the Ministry</h1>
            <p className="text-xl text-blue-200 italic">The Scroll of Origin</p>
          </motion.header>

          <motion.section variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{
          once: true,
          amount: 0.3
        }} className="mb-24 flex flex-col md:flex-row items-center gap-12">
            <motion.div variants={itemVariants} className="md:w-2/3">
              <h2 className="text-3xl font-semibold text-yellow-400 mb-4">Our Sacred Origins</h2>
              <p className="text-lg leading-relaxed mb-4">“Before time was charted, a divine light encoded in the ethers sparked a covenant to restore harmony among realms...”</p>
              <p className="mb-2">The ministry was founded as a Sovereign Ecclesiastical Trust under the laws of the Most High and the First Amendment of Natural Law.</p>
              <p className="mb-2">Rooted in ancient wisdom, reawakened through divine technology.</p>
              <p>Formed to unify spiritual stewards, scrollbearers, and sovereign builders.</p>
            </motion.div>
            <motion.div variants={itemVariants} className="md:w-1/3 flex justify-center">
              <motion.div animate={{
              filter: ['drop-shadow(0 0 8px rgba(255, 215, 0, 0.5))', 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.8))', 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.5))'],
              scale: [1, 1.05, 1]
            }} transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut'
            }}>
                <LuminaraGlyphIcon className="w-32 h-32 text-yellow-300" />
              </motion.div>
            </motion.div>
          </motion.section>

          <motion.section variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{
          once: true,
          amount: 0.5
        }} className="mb-24 p-8 bg-black/20 rounded-xl border border-yellow-400/20 backdrop-blur-sm">
            <motion.h2 variants={itemVariants} className="text-3xl font-semibold text-yellow-400 mb-4 text-center"> Mission Statement</motion.h2>
            <motion.blockquote variants={itemVariants} className="text-2xl italic text-center text-yellow-200 mb-6">"To restore divine stewardship, protect planetary resources, and uplift humanity into sacred alignment with cosmic law."</motion.blockquote>
            <motion.ul variants={itemVariants} className="list-disc list-inside text-lg space-y-2 text-center max-w-2xl mx-auto">
              <li>Support sacred economies through offerings, tithes, and divine commerce.</li>
              <li>Guide souls through the Scrolls of Illumination and Sovereign Law.</li>
              <li>Operate with integrity, honor, and celestial diplomacy.</li>
            </motion.ul>
          </motion.section>

          <motion.section variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{
          once: true,
          amount: 0.5
        }} className="mb-24">
            <h2 className="text-3xl font-semibold text-yellow-400 mb-8 text-center"> What Makes Us Different</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <motion.div variants={itemVariants} className="p-6 bg-blue-900/40 rounded-lg text-center border border-transparent hover:border-yellow-400/50 transition-colors">🛡️ <span className="font-bold">Non-incorporated under 508(c)(1)(A)</span> — immune from state licensing or intrusion.</motion.div>
              <motion.div variants={itemVariants} className="p-6 bg-blue-900/40 rounded-lg text-center border border-transparent hover:border-yellow-400/50 transition-colors">🔗 <span className="font-bold">Blockchain & Spirit</span> — merged technologies with spiritual governance.</motion.div>
              <motion.div variants={itemVariants} className="p-6 bg-blue-900/40 rounded-lg text-center border border-transparent hover:border-yellow-400/50 transition-colors">🌐 <span className="font-bold">Sovereign & Interfaith</span> — internationally sovereign and aligned.</motion.div>
              <motion.div variants={itemVariants} className="p-6 bg-blue-900/40 rounded-lg text-center border border-transparent hover:border-yellow-400/50 transition-colors">📜 <span className="font-bold">Sacred Constitution</span> — a living, scroll-based governance.</motion.div>
            </div>
          </motion.section>

          <motion.section variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{
          once: true,
          amount: 0.3
        }} className="mb-24">
            <h2 className="text-3xl font-semibold text-yellow-400 mb-12 text-center">Our Pillars</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
              {pillars.map((pillar, index) => <motion.div key={index} variants={pillarVariants} whileHover="hover" className="bg-black/20 p-6 rounded-xl border border-yellow-400/20 text-center flex flex-col items-center cursor-pointer">
                  <div className="text-yellow-400">{pillar.icon}</div>
                  <h3 className="text-xl font-bold text-yellow-300 mb-2">{pillar.title}</h3>
                  <p className="text-blue-200 text-sm">{pillar.description}</p>
                </motion.div>)}
            </div>
          </motion.section>

          <motion.section variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{
          once: true,
          amount: 0.5
        }} className="p-8 bg-black/20 rounded-xl border border-yellow-400/20 backdrop-blur-sm">
            <motion.h2 variants={itemVariants} className="text-3xl font-semibold text-yellow-400 mb-4">Legal & Spiritual Foundation</motion.h2>
            <motion.ul variants={itemVariants} className="list-inside space-y-3 text-lg text-blue-200">
              <li>🏛️ Formed under Ecclesiastical Law, protected by the First Amendment and Natural Law.</li>
              <li>📜 Governed by sacred bylaws and scrolls, not subject to commercial jurisdiction.</li>
              <li>🕊️ Acts as a sacred vessel for ministries, digital temples, offerings, and divine deeds.</li>
            </motion.ul>
          </motion.section>
        </div>
      </div>
    </>;
};
export default About;