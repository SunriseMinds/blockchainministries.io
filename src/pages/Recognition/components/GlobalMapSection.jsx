import React from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import OfficeCard from '@/pages/Recognition/components/OfficeCard';

const GlobalMapSection = ({ offices }) => {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="sacred-font text-4xl md:text-5xl font-bold mb-6 gradient-text">
            Ministries & Diplomats Map
          </h2>
          <p className="text-xl text-gray-300">
            Our sacred presence across the globe
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="celestial-bg rounded-2xl p-8 mb-12"
        >
          <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center relative overflow-hidden">
            <div className="text-center">
              <Globe className="w-24 h-24 text-yellow-400 mx-auto mb-4 sacred-pulse" />
              <h3 className="sacred-font text-2xl font-bold text-yellow-400 mb-2">
                Interactive Global Map
              </h3>
              <p className="text-gray-300">
                Explore our worldwide ministry locations and diplomatic presence
              </p>
            </div>
            <div className="absolute top-4 left-4 w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
            <div className="absolute top-8 right-12 w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="absolute bottom-12 left-16 w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
            <div className="absolute bottom-8 right-8 w-3 h-3 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {offices.map((office, index) => (
            <OfficeCard key={index} office={office} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default GlobalMapSection;