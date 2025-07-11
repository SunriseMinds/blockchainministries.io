import React from 'react';
import { motion } from 'framer-motion';

const GlobalImpactStats = ({ stats }) => {
  return (
    <section className="py-16 px-4 bg-gradient-to-r from-slate-900/50 to-slate-800/50">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="sacred-font text-4xl md:text-5xl font-bold mb-6 gradient-text">
            Global Impact
          </h2>
          <p className="text-xl text-gray-300">
            Our growing influence and sacred mission worldwide
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className="celestial-bg rounded-2xl p-8 text-center hover:scale-105 transition-all duration-300"
              >
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                  <Icon className="w-8 h-8 text-slate-900" />
                </div>
                <div className="sacred-font text-4xl font-bold text-yellow-400 mb-2">
                  {stat.number}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {stat.label}
                </h3>
                <p className="text-gray-300 text-sm">
                  {stat.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default GlobalImpactStats;