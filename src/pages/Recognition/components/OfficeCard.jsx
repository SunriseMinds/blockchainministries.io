import React from 'react';
import { motion } from 'framer-motion';
import { Building } from 'lucide-react';

const OfficeCard = ({ office, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: index * 0.1 }}
      className="celestial-bg rounded-2xl p-6 hover:scale-105 transition-all duration-300"
    >
      <div className="flex items-center mb-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
          office.status === 'Active' ? 'bg-green-500/20' : 'bg-yellow-500/20'
        }`}>
          <Building className={`w-6 h-6 ${
            office.status === 'Active' ? 'text-green-400' : 'text-yellow-400'
          }`} />
        </div>
        <div>
          <h3 className="sacred-font text-lg font-bold text-yellow-400">
            {office.country}
          </h3>
          <p className="text-gray-300 text-sm">{office.city}</p>
        </div>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Type:</span>
          <span className="text-gray-300">{office.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Status:</span>
          <span className={office.status === 'Active' ? 'text-green-400' : 'text-yellow-400'}>
            {office.status}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Established:</span>
          <span className="text-gray-300">{office.established}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Ministers:</span>
          <span className="text-gray-300">{office.ministers}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default OfficeCard;