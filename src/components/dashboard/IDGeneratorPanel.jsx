import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, UserSquare2 } from 'lucide-react';
import MinisterIDCard from './MinisterIDCard';

const IDGeneratorPanel = ({ ministerData }) => {
  const idCardRef = useRef();

  const handleDownload = () => {
    if (idCardRef.current) {
      html2canvas(idCardRef.current, {
        backgroundColor: null, // transparent background
        useCORS: true,
      }).then((canvas) => {
        const link = document.createElement('a');
        link.download = `minister-id-${ministerData.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg w-full">
        <CardHeader>
          <CardTitle className="text-yellow-400 text-2xl flex items-center">
            <UserSquare2 className="mr-3" />
            Download Minister ID
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div ref={idCardRef}>
            <MinisterIDCard ministerData={ministerData} />
          </div>
          <Button
            onClick={handleDownload}
            className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Digital ID Card
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default IDGeneratorPanel;