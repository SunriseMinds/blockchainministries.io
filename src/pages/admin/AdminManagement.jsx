import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, ShieldCheck, Award } from 'lucide-react';

const AdminManagement = () => {
  const { toast } = useToast();
  const [pendingMemberships, setPendingMemberships] = useState([]);
  const [pendingOrdinations, setPendingOrdinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [membershipsRes, ordinationsRes] = await Promise.all([
        supabase.from('memberships').select('*, profiles(display_name), users(email)').eq('status', 'pending'),
        supabase.from('ordinations').select('*, profiles(display_name), users(email)').eq('status', 'pending')
      ]);

      if (membershipsRes.error) throw membershipsRes.error;
      setPendingMemberships(membershipsRes.data);

      if (ordinationsRes.error) throw ordinationsRes.error;
      setPendingOrdinations(ordinationsRes.data);

    } catch (error) {
      toast({ title: 'Error fetching data', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApproveMembership = async (membershipId) => {
    setProcessingId(membershipId);
    try {
      const { error } = await supabase.functions.invoke('admin-approve-membership', {
        body: { membership_id: membershipId },
      });
      if (error) throw error;
      toast({ title: 'Membership Approved', description: 'NFT minted and status updated.', className: 'bg-green-800 text-white' });
      fetchData();
    } catch (error) {
      toast({ title: 'Approval Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveOrdination = async (ordinationId) => {
    setProcessingId(ordinationId);
    try {
      const { error } = await supabase.functions.invoke('admin-approve-ordination', {
        body: { ordination_id: ordinationId },
      });
      if (error) throw error;
      toast({ title: 'Ordination Approved', description: 'Credential generated and status updated.', className: 'bg-green-800 text-white' });
      fetchData();
    } catch (error) {
      toast({ title: 'Approval Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (table, id) => {
    setProcessingId(id);
    try {
      const { error } = await supabase.from(table).update({ status: 'rejected' }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Application Rejected', description: 'Status has been updated.', className: 'bg-yellow-800 text-white' });
      fetchData();
    } catch (error) {
      toast({ title: 'Rejection Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const renderApplicationCard = (item, type) => {
    const isProcessing = processingId === item.id;
    const email = item.users?.email || 'N/A';
    const displayName = item.profiles?.display_name || 'N/A';

    return (
      <motion.div
        key={item.id}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="p-4 bg-slate-800/50 rounded-lg border border-yellow-400/20"
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-yellow-300">{displayName}</p>
            <p className="text-sm text-blue-300">{email}</p>
            <p className="text-xs text-blue-400 mt-1">Applied: {new Date(item.created_at).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-green-500 text-green-400 hover:bg-green-500/10 hover:text-green-300"
              onClick={() => type === 'membership' ? handleApproveMembership(item.id) : handleApproveOrdination(item.id)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span className="ml-2">Approve</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => handleReject(type === 'membership' ? 'memberships' : 'ordinations', item.id)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              <span className="ml-2">Reject</span>
            </Button>
          </div>
        </div>
        {type === 'ordination' && (
          <div className="mt-4 p-3 bg-slate-900/70 rounded-md text-sm">
            <p className="font-semibold text-yellow-400">Reason:</p>
            <p className="text-blue-200 whitespace-pre-wrap">{item.application_json.reason}</p>
            <p className="font-semibold text-yellow-400 mt-2">Experience:</p>
            <p className="text-blue-200 whitespace-pre-wrap">{item.application_json.experience}</p>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Admin Management | Blockchain Ministries</title>
      </Helmet>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Application Management</h1>
        <p className="text-blue-200 mb-8">Review and process pending membership and ordination requests.</p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
          <p className="ml-4 text-yellow-400">Loading applications...</p>
        </div>
      ) : (
        <Tabs defaultValue="memberships" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-blue-950/50 border border-yellow-400/20">
            <TabsTrigger value="memberships">
              <ShieldCheck className="w-4 h-4 mr-2" /> Memberships ({pendingMemberships.length})
            </TabsTrigger>
            <TabsTrigger value="ordinations">
              <Award className="w-4 h-4 mr-2" /> Ordinations ({pendingOrdinations.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="memberships" className="mt-6">
            <Card className="celestial-bg border-yellow-400/20">
              <CardHeader>
                <CardTitle>Pending Membership Applications</CardTitle>
                <CardDescription>Approve to mint membership NFT and grant access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingMemberships.length > 0 ? (
                  pendingMemberships.map(item => renderApplicationCard(item, 'membership'))
                ) : (
                  <p className="text-center text-blue-300 py-8">No pending membership applications.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="ordinations" className="mt-6">
            <Card className="celestial-bg border-yellow-400/20">
              <CardHeader>
                <CardTitle>Pending Ordination Requests</CardTitle>
                <CardDescription>Approve to generate and issue ministerial credentials.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingOrdinations.length > 0 ? (
                  pendingOrdinations.map(item => renderApplicationCard(item, 'ordination'))
                ) : (
                  <p className="text-center text-blue-300 py-8">No pending ordination requests.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
};

export default AdminManagement;