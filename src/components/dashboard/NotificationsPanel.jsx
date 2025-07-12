import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Zap, GitBranch } from 'lucide-react';


import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';

const NotificationsPanel = () => {
  const supabase = useSupabase();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setNotifications(data);
      }
    };

    fetchNotifications();
  }, [supabase]);

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
            {notifications.length === 0 && (
              <li className="text-yellow-200">No notifications available.</li>
            )}
            {notifications.map((item, index) => (
              <motion.li
                key={item.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="flex items-start gap-4"
              >
                <div className="mt-1">
                  <Bell className="text-blue-400" />
                </div>
                <div>
                  <p className="text-yellow-200">{item.message || item.text}</p>
                  <p className="text-xs text-blue-300">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
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
