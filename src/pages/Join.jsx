import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { UserPlus, FileSignature, ClipboardList, Users, Award, Download, Blocks, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const steps = [
  {
    icon: <FileSignature className="w-8 h-8 text-yellow-400" />,
    title: "Covenant",
    description: "Sign the Sacred Membership Covenant.",
  },
  {
    icon: <ClipboardList className="w-8 h-8 text-yellow-400" />,
    title: "Application",
    description: "Complete the online form with spiritual intent.",
  },
  {
    icon: <Users className="w-8 h-8 text-yellow-400" />,
    title: "Verification",
    description: "Your identity and alignment are reviewed by the Elders' Circle.",
  },
  {
    icon: <Award className="w-8 h-8 text-yellow-400" />,
    title: "Welcome",
    description: "Receive your digital scroll, EFT token access, and minister ID.",
  },
];

const testimonials = [
    {
        quote: "Becoming a member of Blockchain Ministries changed the way I walk in my calling — I now operate under divine covering and digital sovereignty.",
        author: "Elder Minister J. Benjamin"
    },
    {
        quote: "The Scroll of Protection reminded me who I truly am. This isn’t just a website, it’s a movement of light.",
        author: "Sister Amira Z."
    }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100 } },
};

const Join = () => {
  return (
    <>
      <Helmet>
        <title>Become a Covenant Member - Blockchain Ministries</title>
        <meta name="description" content="Join the covenant of Blockchain Ministries. Step into sacred protection and sovereign purpose as a member of a living scroll." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-black to-blue-950 text-yellow-100 py-12 px-4 sm:px-6 lg:px-8">
        
        <motion.section
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="text-center mb-20"
        >
          <div className="inline-block p-4 bg-yellow-400/10 rounded-full mb-4 sacred-pulse">
            <UserPlus className="w-16 h-16 text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.7))' }} />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 20px rgba(253, 224, 71, 0.4)' }}>
            Become a Covenant Member of Blockchain Ministries
          </h1>
          <p className="text-xl text-blue-200 italic max-w-3xl mx-auto">
            Step into sacred protection and sovereign purpose. As a member of Blockchain Ministries, you are joined to a living scroll — protected under divine trust, ministerial law, and spiritual alignment.
          </p>
        </motion.section>

        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="max-w-7xl mx-auto mb-24"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {steps.map((step, index) => (
                    <motion.div variants={itemVariants} key={index}>
                        <Card className="h-full text-center bg-black/30 border-yellow-400/20 text-white celestial-bg p-6 flex flex-col items-center justify-start hover:border-yellow-400/50 transition-all duration-300 hover:shadow-xl hover:shadow-yellow-500/10">
                            <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                                {step.icon}
                            </div>
                            <p className="text-sm font-bold text-yellow-500 tracking-widest uppercase">STEP {index + 1}</p>
                            <h3 className="text-2xl font-bold text-yellow-300 sacred-font mt-2 mb-2">{step.title}</h3>
                            <p className="text-blue-300 text-sm">{step.description}</p>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          className="max-w-5xl mx-auto mb-24"
        >
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 sacred-font gradient-text">From Our Members</h2>
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
                {testimonials.map((testimonial, index) => (
                    <motion.div variants={itemVariants} key={index}>
                        <Card className="h-full bg-black/30 border-yellow-400/20 text-white celestial-bg p-8 relative">
                            <Quote className="absolute top-4 left-4 w-12 h-12 text-yellow-500/10" />
                            <CardContent className="p-0 relative z-10">
                                <p className="text-lg italic text-blue-200 mb-6">"{testimonial.quote}"</p>
                                <p className="text-right font-bold text-yellow-400 sacred-font">— {testimonial.author}</p>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </motion.div>
        </motion.section>

        <motion.section
          variants={itemVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto"
        >
          <div className="celestial-bg p-8 rounded-2xl text-center flex flex-col items-center justify-center border border-yellow-400/20">
            <h3 className="text-3xl font-bold text-yellow-300 sacred-font mb-4">Membership Covenant</h3>
            <p className="text-blue-200 mb-6">Download and review the sacred covenant before beginning your application.</p>
            <Button asChild className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105">
              <a href="/scrolls/membership-covenant.pdf" target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download Covenant
              </a>
            </Button>
          </div>
          <div className="celestial-bg p-8 rounded-2xl text-center flex flex-col items-center justify-center border border-yellow-400/20">
            <Blocks className="w-10 h-10 text-yellow-400 mb-4" />
            <h3 className="text-3xl font-bold text-yellow-300 sacred-font mb-4">Blockchain Verification</h3>
            <p className="text-blue-200">Once verified, your spiritual ID will be minted as an NFT on the XRPL.</p>
          </div>
        </motion.section>

      </div>
    </>
  );
};

export default Join;