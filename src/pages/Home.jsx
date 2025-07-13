import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <>
      <Helmet>
        <title>Blockchain Ministries – A Sovereign Spiritual Trust</title>
        <meta
          name="description"
          content="Official site for Blockchain Ministries. Explore sacred scrolls, join the covenant, and participate in planetary upliftment."
        />
        <meta
          name="keywords"
          content="blockchain ministry, sovereign trust, spiritual organization, scrolls, NFT, covenant, XRPL"
        />
        <link rel="canonical" href="https://blockchainministries.io/" />
      </Helmet>

      <div className="relative min-h-screen bg-gradient-to-br from-[#0B1426] via-[#1E3A8A] to-[#4C1D95] flex flex-col items-center justify-center text-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="relative w-56 h-56 mb-8 flex items-center justify-center"
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 blur-3xl opacity-60 animate-pulse"></div>
          <svg
            className="absolute inset-0 w-full h-full text-[#FFD700] drop-shadow-[0_0_10px_rgba(255,215,0,0.7)]"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Sacred Glyph Glowing in Gold"
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M50 10 L85 50 L50 90 L15 50 Z"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r="20"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M50 25 L75 50 L50 75 L25 50 Z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="text-4xl md:text-6xl font-serif font-bold text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.8)] mb-6"
        >
          Join the Covenant of Light & Truth
        </motion.h1>
      </div>
    </>
  );
};

export default Home;
