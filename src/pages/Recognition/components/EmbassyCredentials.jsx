import React from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

const EmbassyCredentials = ({ onDownload }) => {
  const credentialItems = [
    { title: "Diplomatic Passport", description: "Official travel document for diplomatic missions" },
    { title: "Embassy Letters", description: "Formal diplomatic correspondence templates" },
    { title: "Recognition Certificates", description: "International recognition documentation" },
    { title: "Ministerial Credentials", description: "Official ecclesiastical authority documents" },
    { title: "Sovereign Immunity Papers", description: "Legal protection and immunity documentation" },
    { title: "Blockchain Verification", description: "Digital authentication and verification system" }
  ];

  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="celestial-bg rounded-2xl p-8 md:p-12"
        >
          <div className="text-center mb-12">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
              <Download className="w-10 h-10 text-slate-900" />
            </div>
            <h2 className="sacred-font text-4xl font-bold mb-4 gradient-text">
              Embassy Credential Package
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Official diplomatic documentation for international recognition
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {credentialItems.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="bg-slate-800/50 rounded-xl p-6 text-center hover:bg-slate-700/50 transition-all duration-300"
              >
                <h3 className="sacred-font text-lg font-bold mb-2 text-yellow-400">
                  {item.title}
                </h3>
                <p className="text-gray-300 text-sm">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <Button
              onClick={onDownload}
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-slate-900 font-bold px-8 py-4 text-lg rounded-xl shadow-2xl transform hover:scale-105 transition-all duration-300"
            >
              <Download className="w-5 h-5 mr-2" />
              Download Embassy Package
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default EmbassyCredentials;