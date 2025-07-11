import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';

const PagePlaceholder = ({ title, description }) => {
  return (
    <>
      <Helmet>
        <title>{title} - Blockchain Ministries</title>
        <meta name="description" content={description} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="p-8 text-white min-h-[calc(100vh-14rem)] flex flex-col items-center justify-center text-center"
      >
        <Construction className="w-24 h-24 text-yellow-500 mb-8" />
        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4">{title}</h1>
        <p className="text-blue-200 max-w-2xl text-lg">{description}</p>
        <p className="text-blue-300 mt-4">This scroll is still being transcribed. Please check back later.</p>
      </motion.div>
    </>
  );
};

export default PagePlaceholder;