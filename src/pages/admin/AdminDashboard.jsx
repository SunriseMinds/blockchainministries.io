import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, User, Clock, MessageSquare } from 'lucide-react';

const AdminDashboard = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchInquiries = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching inquiries:', error);
        toast({
          title: 'Error',
          description: 'Could not fetch contact inquiries.',
          variant: 'destructive',
        });
      } else {
        setInquiries(data);
      }
      setLoading(false);
    };

    fetchInquiries();

    const channel = supabase
      .channel('realtime:public:contact_inquiries')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_inquiries' },
        (payload) => {
          console.log('📬 New contact message:', payload.new);
          setInquiries((prevInquiries) => [payload.new, ...prevInquiries]);
          toast({
            title: '📬 New Inquiry Received!',
            description: `From: ${payload.new.name} (${payload.new.email})`,
            className: 'bg-green-800/80 border-green-400 text-white backdrop-blur-md',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>Admin Dashboard - Inquiries</title>
        <meta name="description" content="Manage contact inquiries in real-time." />
      </Helmet>
      <div className="p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Contact Inquiries</h1>
          <p className="text-blue-200 mb-6">Live feed of all transmissions received through the contact channel.</p>
        </motion.div>

        {loading ? (
          <p className="text-center text-yellow-400">Loading sacred transmissions...</p>
        ) : inquiries.length === 0 ? (
          <p className="text-center text-blue-300 mt-8">The channel is quiet. No inquiries yet.</p>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {inquiries.map((inquiry) => (
                <motion.div
                  key={inquiry.id}
                  layout
                  initial={{ opacity: 0, y: 50, scale: 0.3 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 50, mass: 1 }}
                >
                  <Card className="bg-slate-900/50 border border-yellow-600/30 text-white">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-yellow-400">
                        <span>{inquiry.inquiry_type || 'General Inquiry'}</span>
                        <span className="text-xs font-normal text-blue-300 flex items-center gap-2">
                           <Clock className="w-4 h-4" />
                           {new Date(inquiry.created_at).toLocaleString()}
                        </span>
                      </CardTitle>
                      <CardDescription className="text-blue-200 pt-2 flex items-center gap-4">
                        <span className="flex items-center gap-2"><User className="w-4 h-4" /> {inquiry.name}</span>
                        <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> {inquiry.email}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-blue-100 whitespace-pre-wrap"><MessageSquare className="inline w-4 h-4 mr-2" />{inquiry.message}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminDashboard;