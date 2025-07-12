import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/SupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, XCircle, Loader2, User, Award } from 'lucide-react';

const AdminManagement = () => {
  const { toast } = useToast();
  const [pendingOrdinations, setPendingOrdinations] = useState([]);
  const [pendingCredentials, setPendingCredentials] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [ords, creds] = await Promise.all([
        supabase.from('ordinations').select('*, profiles(full_name)').eq('status', 'pending'),
        supabase.from('credentials').select('*, profiles(full_name)').eq('status', 'pending')
      ]);

      if (ords.error) throw ords.error;
      if (creds.error) throw creds.error;

      setPendingOrdinations(ords.data || []);
      setPendingCredentials(creds.data || []);

    } catch (error) {
      console.error('Error fetching pending requests:', error);
      toast({
        title: 'Error',
        description: 'Could not fetch pending requests.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingRequests();

    const channel = supabase
      .channel('realtime:admin:management')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ordinations', filter: 'status=eq.pending' }, () => fetchPendingRequests())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'credentials', filter: 'status=eq.pending' }, () => fetchPendingRequests())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPendingRequests]);

  const mintNFT = async (credentialId) => {
    toast({ title: 'Minting NFT...', description: 'This is a placeholder and may take a moment.' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`Minting NFT for credential: ${credentialId}`);
    return `https://example.com/nft/${credentialId}/${Date.now()}`;
  };

  const handleApproveOrdination = async (id) => {
    const { error } = await supabase
      .from('ordinations')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error Approving', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Ordination approved.', className: 'bg-green-800/80 border-green-400 text-white backdrop-blur-md' });
      fetchPendingRequests();
    }
  };

  const handleApproveCredential = async (id) => {
    const nft_url = await mintNFT(id);

    const { error } = await supabase
      .from('credentials')
      .update({ status: 'issued', details: { nft_url } })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error Approving', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Credential approved and NFT issued.', className: 'bg-green-800/80 border-green-400 text-white backdrop-blur-md' });
      fetchPendingRequests();
    }
  };

  const handleReject = async (id, table) => {
    const { error } = await supabase
      .from(table)
      .update({ status: 'rejected' })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error Rejecting', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Request Rejected', description: 'The request has been marked as rejected.' });
      fetchPendingRequests();
    }
  };

  const renderRequestList = (requests, type) => {
    if (loading) {
      return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-yellow-400" /></div>;
    }
    if (requests.length === 0) {
      return <p className="text-center text-blue-300 p-8">No pending {type} requests.</p>;
    }
    return (
      <div className="space-y-4">
        {requests.map((req) => (
          <Card key={req.id} className="bg-slate-800/50 border border-yellow-600/50">
            <CardHeader>
              <CardTitle className="text-yellow-300">
                {type === 'ordination' ? `Ordination for: ${req.fullname}` : `Credential: ${req.type}`}
              </CardTitle>
              <CardDescription className="text-blue-200 pt-1">
                Requested by: {req.profiles?.full_name || 'Unknown User'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end gap-4">
              <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-900/50 hover:text-red-300" onClick={() => handleReject(req.id, type === 'ordination' ? 'ordinations' : 'credentials')}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white" onClick={() => type === 'ordination' ? handleApproveOrdination(req.id) : handleApproveCredential(req.id)}>
                <CheckCircle className="mr-2 h-4 w-4" /> Approve
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Admin Management | Blockchain Ministries</title>
        <meta name="description" content="Approve or reject pending ordinations and credentials." />
      </Helmet>
      <div className="p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Request Management</h1>
          <p className="text-blue-200 mb-6">Review and process pending requests from members.</p>
        </motion.div>

        <Tabs defaultValue="ordinations" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/50 border border-yellow-600/30">
            <TabsTrigger value="ordinations" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300">
              <User className="mr-2 h-4 w-4" /> Pending Ordinations ({pendingOrdinations.length})
            </TabsTrigger>
            <TabsTrigger value="credentials" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300">
              <Award className="mr-2 h-4 w-4" /> Pending Credentials ({pendingCredentials.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ordinations" className="mt-4">
            {renderRequestList(pendingOrdinations, 'ordination')}
          </TabsContent>
          <TabsContent value="credentials" className="mt-4">
            {renderRequestList(pendingCredentials, 'credential')}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default AdminManagement;