import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Zap, GitBranch } from 'lucide-react';

const notifications = [
  { icon: <GitBranch className="text-green-400" />, text: "New DAO proposal: 'Temple Grant for Luminous Finance'", time: "2h ago" },
  { icon: <Zap className="text-red-500" />, text: "Ritual Burn complete. 10,000 EFT removed from circulation.", time: "1 day ago" },
  { icon: <Bell className="text-blue-400" />, text: "Welcome to the Minister's Dashboard, your sacred space.", time: "3 days ago" },
];

const NotificationsPanel = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg w-full">
        <CardHeader>
          <CardTitle className="text-yellow-400 text-2xl flex items-center">
            <Bell className="mr-3" />
            Notifications & Scrolls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {notifications.map((item, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="flex items-start gap-4"
              >
                <div className="mt-1">{item.icon}</div>
                <div>
                  <p className="text-yellow-200">{item.text}</p>
                  <p className="text-xs text-blue-300">{item.time}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default NotificationsPanel;