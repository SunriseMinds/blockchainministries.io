import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin } from 'lucide-react';
import ContactForm from '@/pages/Contact/components/ContactForm';
const Contact = () => {
  return <>
      <Helmet>
        <title>Contact Us - Blockchain Ministries</title>
        <meta name="description" content="Open a channel of communication with Blockchain Ministries for inquiries, scroll requests, or diplomatic outreach." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-black to-blue-950 text-yellow-100 py-12 px-4 sm:px-6 lg:px-8">
        <motion.header initial={{
        opacity: 0,
        y: -50
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 1,
        ease: 'easeOut'
      }} className="text-center mb-16">
          <div className="inline-block p-4 bg-yellow-400/10 rounded-full mb-4 sacred-pulse">
            <Mail className="w-16 h-16 text-yellow-400" style={{
            filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.7))'
          }} />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{
          textShadow: '0 0 20px rgba(253, 224, 71, 0.4)'
        }}>
            Open a Channel
          </h1>
          <p className="text-xl text-blue-200 italic max-w-3xl mx-auto">
            For inquiries, scroll requests, or diplomatic outreach, our communication lines are open.
          </p>
        </motion.header>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <motion.div initial={{
          opacity: 0,
          x: -50
        }} animate={{
          opacity: 1,
          x: 0
        }} transition={{
          duration: 0.8,
          ease: 'easeOut',
          delay: 0.2
        }} className="lg:sticky lg:top-24">
             <h2 className="text-3xl font-bold text-yellow-300 sacred-font mb-6">Contact Information</h2>
             <p className="text-blue-200 mb-8">
                While our primary operations exist within the digital and spiritual realms, we maintain communication channels for official correspondence. Please use the form for most inquiries.
             </p>
             <div className="space-y-6">
                <div className="flex items-center gap-4 text-lg">
                    <div className="p-3 bg-yellow-400/10 rounded-full text-yellow-400">
                        <Mail className="w-6 h-6" />
                    </div>
                    <span className="text-blue-200 hover:text-yellow-300 transition-colors">contact@blockchainministries.io</span>
                </div>
                <div className="flex items-center gap-4 text-lg">
                    <div className="p-3 bg-yellow-400/10 rounded-full text-yellow-400">
                        <Phone className="w-6 h-6" />
                    </div>
                    <span className="text-blue-200">(+1) 216-309-0675 </span>
                </div>
                 <div className="flex items-center gap-4 text-lg">
                    <div className="p-3 bg-yellow-400/10 rounded-full text-yellow-400">
                        <MapPin className="w-6 h-6" />
                    </div>
                    <span className="text-blue-200">Digital Realm / XRPL / Inter-dimensional Nexus</span>
                </div>
             </div>
          </motion.div>
          <motion.div initial={{
          opacity: 0,
          x: 50
        }} animate={{
          opacity: 1,
          x: 0
        }} transition={{
          duration: 0.8,
          ease: 'easeOut',
          delay: 0.4
        }}>
            <ContactForm />
          </motion.div>
        </div>
      </div>
    </>;
};
export default Contact;