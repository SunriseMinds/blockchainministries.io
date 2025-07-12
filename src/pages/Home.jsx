import React from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen } from 'lucide-react';
import SacredSymbolCarousel from '@/pages/Home/components/SacredSymbolCarousel';
import { Link } from 'react-router-dom';
import ScrollsCTA from '@/pages/Home/components/ScrollsCTA';
import XUMMConnect from '../components/XUMMConnect';

const Home = () => {
  return (
    <>
      <Helmet>
        <title>Blockchain Ministries – A Sovereign Spiritual Trust</title>
        <meta name="description" content="Official site for Blockchain Ministries. Explore sacred scrolls, join the covenant, and participate in planetary upliftment." />
        <meta name="keywords" content="blockchain ministry, sovereign trust, spiritual organization, scrolls, NFT, covenant, XRPL" />
        <link rel="canonical" href="https://blockchainministries.io/" />
      </Helmet>
      <div className="flex flex-col items-center justify-center text-center text-white p-4 py-24 min-h-[80vh]">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative w-48 h-48 mb-8 flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full blur-3xl opacity-40 animate-pulse"></div>
          <motion.svg
            className="absolute inset-0 w-full h-full text-yellow-400/80"
            viewBox="0 0 100 100"
            aria-label="Sacred Geometry Logo Frame"
            initial={{ rotate: -90 }}
            animate={{ rotate: 270 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          >
            <title>Sacred Geometry Logo Frame</title>
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="50" cy="50" r="25" stroke="currentColor" strokeWidth="1" fill="none" />
          </motion.svg>
          <SacredSymbolCarousel />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font"
          style={{ textShadow: '0 0 20px rgba(253, 224, 71, 0.4)' }}
        >
          Join the Covenant of Light & Truth
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-lg md:text-xl text-blue-200 max-w-3xl mx-auto mb-12"
        >
          Blockchain Ministries is a decentralized spiritual trust, protected by divine law and encoded in immutable ledgers. We preserve sacred scrolls, serve global ministries, and empower sovereign believers through spiritual governance and digital truth.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, type: "spring", stiffness: 100 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Button asChild size="lg" className="bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20">
            <Link to="/join">
              Join the Mission <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10 hover:border-yellow-300 hover:text-yellow-300 transition-colors duration-300 backdrop-blur-sm">
            <Link to="/scrolls">
              Access Sacred Scrolls <BookOpen className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="text-md text-blue-300/80 mt-8 italic"
        >
          Seal your place in the divine ledger. Receive your scroll. Ignite your purpose.
        </motion.p>

        <div className="mt-12">
          <XUMMConnect />
        </div>
      </div>

      {/* Mission Section */}
      <motion.section
        initial={{ x: -80, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="bg-indigo-50 py-12 px-6"
      >
        <h3 className="text-2xl font-semibold mb-4 text-indigo-900 text-center">
          Our Mission
        </h3>
        <p className="max-w-3xl mx-auto text-center">
          We provide spiritual tools and technology for ministers and members worldwide. Blockchain Ministries enables on-chain credentials, sacred token issuance, decentralized governance, and secure document verification — rooted in divine sovereignty.
        </p>
      </motion.section>

      {/* Features / NFTs */}
      <motion.section
        initial={{ y: 80, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="py-12 px-6"
      >
        <h3 className="text-2xl font-semibold text-center text-indigo-900 mb-8">
          Sacred NFTs & Digital Scrolls
        </h3>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { title: "Minister NFT ID", desc: "Receive your blockchain-verified ministerial credential." },
            { title: "SoulScrolls", desc: "Sacred digital documents timestamped and immutable." },
            { title: "Voting Tokens", desc: "Participate in community decisions via DAO mechanisms." },
          ].map((card, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition"
            >
              <h4 className="text-lg font-semibold mb-2 text-indigo-700">{card.title}</h4>
              <p className="text-sm text-gray-600">{card.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <ScrollsCTA />

      {/* Join CTA */}
      <motion.section
        whileInView={{ scale: [0.95, 1] }}
        transition={{ duration: 0.5 }}
        className="bg-indigo-600 py-16 text-white text-center"
      >
        <h3 className="text-3xl font-bold mb-4">Become a Blockchain Minister Today</h3>
        <p className="mb-6 max-w-xl mx-auto">
          Step into your divine digital authority. Mint your ministerial NFT and access sacred tools.
        </p>
        <a href="/signup">
          <Button className="bg-white text-indigo-700 px-6 py-3 rounded-xl font-semibold shadow-md hover:bg-gray-100">
            Sign Up
          </Button>
        </a>
      </motion.section>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-gray-500 bg-white border-t mt-6">
        © {new Date().getFullYear()} Blockchain Ministries. All rights reserved.
      </footer>
    </>
  );
};

export default Home;
