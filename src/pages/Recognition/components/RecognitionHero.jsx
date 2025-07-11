import React from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

const RecognitionHero = () => {
  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 geometric-pattern opacity-20"></div>
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center sacred-pulse">
            <Globe className="w-12 h-12 text-slate-900" />
          </div>
          <h1 className="sacred-font text-5xl md:text-6xl font-bold mb-6 gradient-text">
            Global Recognition
          </h1>
          <p className="text-xl text-gray-300 max-w-4xl mx-auto">
            International presence and diplomatic relations spanning continents
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default RecognitionHero;