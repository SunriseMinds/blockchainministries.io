import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

const recentUpdatesMock = [
  { id: 1, title: 'New feature: Enhanced Dashboard', date: '2025-07-10' },
  { id: 2, title: 'Security update applied', date: '2025-07-08' },
  { id: 3, title: 'Scheduled maintenance completed', date: '2025-07-05' },
];

const RecentUpdates = () => {
  return (
    <motion.div variants={cardVariants}>
      <Card className="bg-slate-900/50 border border-yellow-600/30 text-white h-full">
        <CardHeader>
          <CardTitle className="text-yellow-400">Recent Updates</CardTitle>
          <CardDescription className="text-blue-300">Latest news and updates from Blockchain Ministries</CardDescription>
        </CardHeader>
        <CardContent>
          {recentUpdatesMock.length > 0 ? (
            <ul className="space-y-3">
              <AnimatePresence>
                {recentUpdatesMock.map(update => (
                  <motion.li key={update.id} variants={itemVariants} layout exit={{ opacity: 0, x: 30 }} className="p-3 bg-slate-800/50 rounded-lg border-l-4 border-yellow-500">
                    <p className="font-bold text-yellow-200">{update.title}</p>
                    <p className="text-sm text-blue-200">Date: {new Date(update.date).toLocaleDateString()}</p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="text-blue-300">No recent updates available.</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default RecentUpdates;
