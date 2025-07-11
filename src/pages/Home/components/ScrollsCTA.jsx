import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollText } from 'lucide-react';

const ScrollsCTA = () => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="py-20 px-4"
    >
      <div className="container mx-auto max-w-4xl bg-slate-900/50 border border-yellow-600/50 rounded-2xl p-8 md:p-12 text-center shadow-2xl shadow-yellow-500/10 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute inset-0 sacred-pattern opacity-5"></div>
        <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1, type: "spring", stiffness: 50, delay: 0.2 }}
            className="mx-auto mb-6 w-20 h-20 flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-400/20 to-amber-600/20 border border-yellow-500/50"
        >
            <ScrollText className="w-10 h-10 text-yellow-400" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.7))' }} />
        </motion.div>
        
        <h2 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font">
          Download the Sacred Scrolls of Divine Protection
        </h2>
        <p className="text-lg text-blue-200 max-w-3xl mx-auto mb-8">
          These scrolls are encoded with wisdom, law, and light. Enter the covenant, receive divine covering, and align with the mission of the Eternal Ledger.
        </p>
        <motion.div
            initial={{ scale: 0.9 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.4 }}
        >
            <Button asChild size="lg" className="bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-yellow-500/20">
              <Link to="/scrolls">
                Access the Scrolls
                <ScrollText className="ml-2 h-5 w-5" />
              </Link>
            </Button>
        </motion.div>
      </div>
    </motion.section>
  );
};

export default ScrollsCTA;