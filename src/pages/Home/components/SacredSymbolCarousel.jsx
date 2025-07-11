import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { AnkhIcon } from '@/components/icons/AnkhIcon';
import { ChristianCrossIcon } from '@/components/icons/ChristianCrossIcon';
import { DharmaWheelIcon } from '@/components/icons/DharmaWheelIcon';
import { LuminaraGlyphIcon } from '@/components/icons/LuminaraGlyphIcon';
import { ToriiGateIcon } from '@/components/icons/ToriiGateIcon';
import { YinYangIcon } from '@/components/icons/YinYangIcon';

const sacredIcons = [
  { component: <ChristianCrossIcon />, label: "Christian Cross" },
  { component: <DharmaWheelIcon />, label: "Dharma Wheel" },
  { component: <YinYangIcon />, label: "Yin-Yang" },
  { component: <ToriiGateIcon />, label: "Torii Gate" },
  { component: <AnkhIcon />, label: "Ankh" },
  { component: <LuminaraGlyphIcon />, label: "Luminara Glyph" },
];

const SacredSymbolCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % sacredIcons.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const { component, label } = sacredIcons[currentIndex];

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="absolute inset-0 flex items-center justify-center w-full h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.5 } }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                className="w-24 h-24 text-yellow-400"
              >
                <motion.div
                  animate={{
                    filter: [
                      'drop-shadow(0 0 4px rgba(255, 215, 0, 0.4))',
                      'drop-shadow(0 0 12px rgba(255, 215, 0, 0.7))',
                      'drop-shadow(0 0 4px rgba(255, 215, 0, 0.4))'
                    ],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="w-full h-full"
                >
                  {React.cloneElement(component, { className: 'w-full h-full' })}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900/80 border-yellow-400/30 text-yellow-300 backdrop-blur-sm">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SacredSymbolCarousel;