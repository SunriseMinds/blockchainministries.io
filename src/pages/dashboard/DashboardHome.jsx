import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Award, FileText, BadgeCheck, Gift } from 'lucide-react';

const DashboardHome = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [ordinations, setOrdinations] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchAllData = async () => {
      try {
        setLoading(true);
        const [ordinationsRes, credentialsRes, donationsRes] = await Promise.all([
          supabase.from('ordinations').select('*').eq('user_id', user.id).eq('status', 'approved'),
          supabase.from('credentials').select('*').eq('user_id', user.id),
          supabase.from('donations').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
        ]);

        if (ordinationsRes.error) throw ordinationsRes.error;
        setOrdinations(ordinationsRes.data || []);

        if (credentialsRes.error) throw credentialsRes.error;
        setCredentials(credentialsRes.data || []);

        if (donationsRes.error) throw donationsRes.error;
        setDonations(donationsRes.data || []);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        toast({
          title: 'Error',
          description: 'Could not load your sacred records. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();

    const channels = [];
    const tables = ['ordinations', 'credentials', 'donations'];
    tables.forEach(table => {
        const channel = supabase
            .channel(`realtime:public:${table}:member:${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: table, filter: `user_id=eq.${user.id}` },
                (payload) => {
                    console.log(`${table} change received!`, payload);
                    toast({ title: `✨ Your ${table} have been updated!` });
                    fetchAllData();
                }
            )
            .subscribe();
        channels.push(channel);
    });

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [user, toast]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  const DataCard = ({ title, description, icon, data, renderItem, emptyText }) => (
    <motion.div variants={cardVariants}>
      <Card className="bg-slate-900/50 border border-yellow-600/30 text-white h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-400">{icon} {title}</CardTitle>
          <CardDescription className="text-blue-300">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.length > 0 ? (
            <ul className="space-y-3">
              <AnimatePresence>
                {data.map(item => (
                  <motion.li key={item.id} variants={itemVariants} layout exit={{ opacity: 0, x: 30 }} className="p-3 bg-slate-800/50 rounded-lg border-l-4 border-yellow-500">
                    {renderItem(item)}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="text-blue-300">{emptyText}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <>
      <Helmet>
        <title>Member Dashboard | Blockchain Ministries</title>
        <meta name="description" content="Your personal dashboard for managing ordinations, credentials, and donations." />
      </Helmet>
      <div className="p-4 md:p-8">
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Welcome to Your Member Dashboard</h1>
            {user && <p className="text-blue-200 mb-8">Here are your sacred records, logged in as {user.email}</p>}
        </motion.div>
        
        {loading ? (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-400"></div>
                <p className="ml-4 text-yellow-400">Loading sacred records...</p>
            </div>
        ) : (
            <motion.div 
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <DataCard
                title="Your Ordinations"
                description="All sacred ordinations approved by the council."
                icon={<BadgeCheck />}
                data={ordinations}
                emptyText="No approved ordinations found in the archives."
                renderItem={o => (
                  <>
                    <p className="font-bold text-yellow-200">{o.fullname}</p>
                    <p className="text-sm text-blue-200">Approved on: {new Date(o.approved_at).toLocaleDateString()}</p>
                  </>
                )}
              />
              <DataCard
                title="Your Credentials"
                description="Digital and spiritual credentials issued to you."
                icon={<Award />}
                data={credentials}
                emptyText="No credentials have been issued at this time."
                renderItem={c => (
                  <>
                    <p className="font-bold text-yellow-200">{c.type}</p>
                    <p className="text-sm text-blue-200">Issued on: {new Date(c.created_at).toLocaleDateString()}</p>
                    <div className="flex gap-4 mt-2">
                      {c.details?.pdf_url && <a href={c.details.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-yellow-400 flex items-center gap-1 text-sm"><FileText size={14}/> View PDF</a>}
                      {c.details?.nft_url && <a href={c.details.nft_url} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-yellow-400 flex items-center gap-1 text-sm"><Award size={14}/> View NFT</a>}
                    </div>
                  </>
                )}
              />
              <DataCard
                title="Your Donations"
                description="Your history of covenant offerings."
                icon={<Gift />}
                data={donations}
                emptyText="No donations have been recorded in the archives."
                renderItem={d => (
                  <>
                    <p className="font-bold text-yellow-200">{d.amount} {d.currency}</p>
                    <p className="text-sm text-blue-200">Offered on: {new Date(d.created_at).toLocaleDateString()}</p>
                    <p className="text-xs text-blue-300 capitalize mt-1">{d.donation_type.replace('-', ' ')}</p>
                  </>
                )}
              />
            </motion.div>
        )}
      </div>
    </>
  );
};

export default DashboardHome;