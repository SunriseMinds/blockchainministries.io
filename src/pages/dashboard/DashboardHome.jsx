import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Award, FileText, BadgeCheck, Gift, Shield, Clock, XCircle } from 'lucide-react';

const DashboardHome = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [membership, setMembership] = useState(null);
  const [ordinations, setOrdinations] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [membershipRes, ordinationsRes, donationsRes] = await Promise.all([
        supabase.from('memberships').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('ordinations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('donations').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      if (membershipRes.error) throw membershipRes.error;
      setMembership(membershipRes.data);

      if (ordinationsRes.error) throw ordinationsRes.error;
      setOrdinations(ordinationsRes.data || []);

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
  }, [user, toast]);

  useEffect(() => {
    fetchAllData();

    if (!user) return;
    const channel = supabase
      .channel(`realtime:member-dashboard:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `user_id=eq.${user.id}` }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordinations', filter: `user_id=eq.${user.id}` }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations', filter: `user_id=eq.${user.id}` }, () => fetchAllData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAllData]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  const MembershipStatusCard = () => {
    let statusIcon, statusText, statusColor, description;
    switch (membership?.status) {
      case 'approved':
        statusIcon = <BadgeCheck className="w-6 h-6" />;
        statusText = 'Approved Member';
        statusColor = 'text-green-400';
        description = 'Your covenant is sealed. Welcome to the fellowship.';
        break;
      case 'pending':
        statusIcon = <Clock className="w-6 h-6" />;
        statusText = 'Membership Pending';
        statusColor = 'text-yellow-400';
        description = 'Your application is under review by the council.';
        break;
      case 'rejected':
        statusIcon = <XCircle className="w-6 h-6" />;
        statusText = 'Membership Rejected';
        statusColor = 'text-red-400';
        description = 'Please contact support for more information.';
        break;
      default:
        statusIcon = <Shield className="w-6 h-6" />;
        statusText = 'Not a Member';
        statusColor = 'text-blue-300';
        description = 'Apply for membership to unlock sacred benefits.';
    }

    return (
      <Card className="bg-slate-900/50 border border-yellow-600/30 text-white">
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${statusColor}`}>{statusIcon} {statusText}</CardTitle>
          <CardDescription className="text-blue-300">{description}</CardDescription>
        </CardHeader>
        {membership?.status === 'approved' && membership.nft_token_id && (
          <CardContent>
            <p className="text-sm font-bold text-yellow-200">Your Membership NFT</p>
            <a 
              href={`https://livenet.xrpl.org/nft/${membership.nft_token_id}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-blue-300 break-all hover:text-yellow-400"
            >
              {membership.nft_token_id}
            </a>
          </CardContent>
        )}
      </Card>
    );
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
      <div>
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
              <div className="lg:col-span-3">
                <MembershipStatusCard />
              </div>
              <DataCard
                title="Your Ordinations"
                description="All sacred ordinations requested."
                icon={<Award />}
                data={ordinations}
                emptyText="No ordination requests found in the archives."
                renderItem={o => (
                  <>
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-yellow-200">{o.application_json.fullName || 'Ordination Request'}</p>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        o.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                        o.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>{o.status}</span>
                    </div>
                    <p className="text-sm text-blue-200">Requested on: {new Date(o.created_at).toLocaleDateString()}</p>
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
                    <p className="font-bold text-yellow-200">${(d.amount_cents / 100).toFixed(2)} {d.currency.toUpperCase()}</p>
                    <p className="text-sm text-blue-200">Offered on: {new Date(d.created_at).toLocaleDateString()}</p>
                    <p className="text-xs text-blue-300 capitalize mt-1">{d.provider}</p>
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