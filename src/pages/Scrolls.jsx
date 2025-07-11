import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ScrollText, Download, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ContactScrollForm from '@/pages/Scrolls/components/ContactScrollForm';

const scrollsData = [
  {
    title: "Trust Declaration",
    description: "The founding charter of Blockchain Ministries outlining its sovereign purpose, trusteeship, and spiritual mandate.",
    link: "/scrolls/trust-declaration.pdf",
    tag: "Legal"
  },
  {
    title: "Diplomatic Credentials",
    description: "Outlines the terms, titles, and privileges of diplomatic representatives recognized under the Ecclesiastical Trust.",
    link: "/scrolls/diplomatic-credentials.pdf",
    tag: "Diplomatic"
  },
  {
    title: "Bylaws of the Ministry",
    description: "The internal governance framework, detailing operational procedures, council responsibilities, and member rights.",
    link: "/scrolls/bylaws.pdf",
    tag: "Governance"
  },
  {
    title: "Sacred Economics Whitepaper",
    description: "A foundational text on the principles of divine commerce, value exchange, and resource stewardship within our ecosystem.",
    link: "/scrolls/sacred-economics.pdf",
    tag: "Spiritual"
  },
  {
    title: "Covenant of Stewardship",
    description: "A sacred agreement for all members, pledging to protect and honor planetary resources and cosmic law.",
    link: "/scrolls/covenant-of-stewardship.pdf",
    tag: "Spiritual"
  },
  {
    title: "Inter-Dimensional Accords",
    description: "Protocols for peaceful and honorable engagement with celestial and extra-planetary sovereignties.",
    link: "/scrolls/interdimensional-accords.pdf",
    tag: "Diplomatic"
  },
];

const tags = ["All", "Legal", "Diplomatic", "Governance", "Spiritual"];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
    },
  },
};

const Scrolls = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredScrolls = useMemo(() => {
    return scrollsData
      .filter(scroll => activeFilter === 'All' || scroll.tag === activeFilter)
      .filter(scroll =>
        scroll.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scroll.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [searchTerm, activeFilter]);

  return (
    <>
      <Helmet>
        <title>Scrolls & Decrees - Blockchain Ministries</title>
        <meta name="description" content="Access our document archive: Trust Declaration, Bylaws, Diplomatic Terms, and more." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-black to-blue-950 text-yellow-100 py-12 px-4 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="text-center mb-16"
        >
          <div className="inline-block p-4 bg-yellow-400/10 rounded-full mb-4 animate-pulse">
            <ScrollText className="w-16 h-16 text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.7))' }} />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 20px rgba(253, 224, 71, 0.4)' }}>
            Scrolls & Decrees
          </h1>
          <p className="text-xl text-blue-200 italic max-w-3xl mx-auto">
            Access our document archive: Trust Declaration, Bylaws, Diplomatic Terms, and more.
          </p>
        </motion.header>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-6xl mx-auto"
        >
          <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-4 mb-8 p-4 bg-black/20 rounded-xl border border-yellow-400/20 backdrop-blur-sm">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-yellow-400/60" />
              <Input
                type="text"
                placeholder="Search scrolls by title or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 bg-blue-950/50 border-yellow-400/30 text-white placeholder:text-blue-300/50 focus:ring-yellow-400"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map(tag => (
                <Button
                  key={tag}
                  onClick={() => setActiveFilter(tag)}
                  variant={activeFilter === tag ? 'default' : 'outline'}
                  className={
                    activeFilter === tag
                      ? 'bg-yellow-400 text-blue-950 hover:bg-yellow-500'
                      : 'text-yellow-300 border-yellow-400/30 hover:bg-yellow-400/10 hover:text-yellow-200'
                  }
                >
                  {tag}
                </Button>
              ))}
            </div>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {filteredScrolls.length > 0 ? (
              filteredScrolls.map((scroll, index) => (
                <motion.div variants={itemVariants} key={index}>
                  <Card className="h-full flex flex-col bg-black/30 border-yellow-400/20 text-white celestial-bg hover:border-yellow-400/50 transition-all duration-300 hover:shadow-2xl hover:shadow-yellow-500/10">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-2xl text-yellow-300 sacred-font">{scroll.title}</CardTitle>
                        <span className="text-xs font-semibold text-blue-950 bg-yellow-400 px-2 py-1 rounded-full">{scroll.tag}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <CardDescription className="text-blue-200">{scroll.description}</CardDescription>
                    </CardContent>
                    <div className="p-6 pt-0">
                      <Button asChild className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-blue-950 font-bold hover:from-yellow-500 hover:to-amber-600 transition-all duration-300 transform hover:scale-105">
                        <a href={scroll.link} target="_blank" rel="noopener noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          Download Scroll
                        </a>
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))
            ) : (
              <motion.div variants={itemVariants} className="col-span-full text-center py-16">
                 <p className="text-2xl text-yellow-300 sacred-font">No scrolls found in this archive.</p>
                 <p className="text-blue-300 mt-2">Try adjusting your search or filter.</p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>

        <div className="my-24">
          <ContactScrollForm />
        </div>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="text-center mt-20"
        >
          <p className="text-lg italic text-blue-300/80 max-w-2xl mx-auto border-t border-yellow-400/20 pt-8">
            “These scrolls are not laws—they are living light encoded in word, honoring the sacred contract between spirit and steward.”
          </p>
        </motion.footer>
      </div>
    </>
  );
};

export default Scrolls;