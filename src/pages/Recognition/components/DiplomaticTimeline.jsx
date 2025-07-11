import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin } from 'lucide-react';

const DiplomaticTimeline = ({ events }) => {
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
            Diplomatic Relations Log
          </h2>
          <p className="text-xl text-gray-300">
            Chronological record of our international recognition and expansion
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-full"></div>
          <div className="space-y-8">
            {events.map((event, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className={`flex items-center ${index % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}
              >
                <div className={`w-1/2 ${index % 2 === 0 ? 'pr-8 text-right' : 'pl-8 text-left'}`}>
                  <div className="celestial-bg rounded-xl p-6">
                    <div className="flex items-center mb-2 justify-end">
                      <Calendar className="w-4 h-4 text-yellow-400 mr-2" />
                      <span className="text-yellow-400 font-bold text-sm">
                        {new Date(event.date).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="sacred-font text-lg font-bold text-white mb-2">
                      {event.event}
                    </h3>
                    <div className="flex items-center text-gray-300 text-sm mb-2 justify-end">
                      <MapPin className="w-3 h-3 mr-1" />
                      <span>{event.location}</span>
                    </div>
                    <span className="inline-block px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                      {event.type}
                    </span>
                  </div>
                </div>
                <div className="relative z-10">
                  <div className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  </div>
                </div>
                <div className="w-1/2"></div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DiplomaticTimeline;