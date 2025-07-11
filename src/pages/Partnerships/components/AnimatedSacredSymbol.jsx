import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, ShieldCheck, Building, HeartHandshake, Globe, Scale, BookOpen } from 'lucide-react';

const symbols = [
    HeartHandshake,
    Gem,
    ShieldCheck,
    Building,
    Globe,
    Scale,
    BookOpen
];

const AnimatedSacredSymbol = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const getRandomInterval = () => Math.random() * (8000 - 5000) + 5000;

        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % symbols.length);
        }, getRandomInterval());

        return () => clearInterval(interval);
    }, []);

    const CurrentSymbol = symbols[currentIndex];

    return (
        <div className="w-24 h-24 mx-auto mb-4 relative flex items-center justify-center">
             <motion.div
                className="absolute inset-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            >
                 <svg className="w-full h-full text-yellow-400/30" viewBox="0 0 100 100" aria-hidden="true">
                     <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="2" fill="none" />
                 </svg>
             </motion.div>
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        transition: { duration: 0.7, ease: 'easeInOut' },
                    }}
                    exit={{
                        opacity: 0,
                        scale: 0.8,
                        transition: { duration: 0.7, ease: 'easeInOut' },
                    }}
                    className="absolute"
                >
                    <motion.div
                         animate={{
                            scale: [1, 1.05, 1],
                            filter: ['drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))', 'drop-shadow(0 0 15px rgba(251, 191, 36, 0.7))', 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))']
                         }}
                         transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: 'easeInOut',
                         }}
                    >
                        <CurrentSymbol className="w-16 h-16 text-yellow-400" />
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default AnimatedSacredSymbol;