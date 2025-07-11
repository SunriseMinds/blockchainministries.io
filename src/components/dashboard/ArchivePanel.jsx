import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BookOpen, Download, Search, Mic } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const scrolls = [
  { title: "The Scroll of Digital Sovereignty", date: "2 days ago", type: "scroll" },
  { title: "Voice of the Flame - Weekly Audio", date: "4 days ago", type: "audio" },
  { title: "Decoded Glyphs: The Genesis Block", date: "1 week ago", type: "scroll" },
  { title: "Commentary on the Covenant", date: "2 weeks ago", type: "scroll" },
];

const ArchivePanel = () => {
  const { toast } = useToast();

  const handleNotImplemented = () => {
    toast({
      title: "Feature Inscription Pending",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      variant: "destructive",
    });
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
            <BookOpen className="mr-3" />
            Sacred Archive Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Input
              type="search"
              placeholder="Search the archives..."
              className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70"
            />
            <Button variant="outline" className="text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10" onClick={handleNotImplemented}>
              <Search />
            </Button>
          </div>
          <ul className="space-y-4">
            {scrolls.map((scroll, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="flex items-center justify-between p-3 bg-blue-900/20 rounded-lg border border-transparent hover:border-yellow-400/30 transition-colors"
              >
                <div className="flex items-center">
                  {scroll.type === 'audio' ? <Mic className="w-5 h-5 mr-3 text-yellow-400" /> : <BookOpen className="w-5 h-5 mr-3 text-yellow-400" />}
                  <div>
                    <p className="font-semibold text-yellow-200">{scroll.title}</p>
                    <p className="text-sm text-blue-300">{scroll.date}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-yellow-400 hover:bg-yellow-400/10" onClick={handleNotImplemented}>
                  <Download className="w-4 h-4" />
                </Button>
              </motion.li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ArchivePanel;