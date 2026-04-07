import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Users, DollarSign, BookOpen, RefreshCw, ShieldCheck, Award } from 'lucide-react';

const AdminDashboard = () => {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState([]);
  const [donations, setDonations] = useState([]);
  const [scrolls, setScrolls] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [ordinations, setOrdinations] = useState([]);
  const [loading, setLoading] = useState({});

  const fetchData = useCallback(async (table, setter) => {
    setLoading(prev => ({ ...prev, [table]: true }));
    try {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setter(data);
    } catch (error) {
      toast({
        title: `Error fetching ${table}`,
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(prev => ({ ...prev, [table]: false }));
    }
  }, [toast]);

  useEffect(() => {
    fetchData('profiles', setProfiles);
    fetchData('donations', setDonations);
    fetchData('scrolls', setScrolls);
    fetchData('memberships', setMemberships);
    fetchData('ordinations', setOrdinations);
  }, [fetchData]);

  const getSetter = (tableName) => {
    switch (tableName) {
      case 'profiles': return setProfiles;
      case 'donations': return setDonations;
      case 'scrolls': return setScrolls;
      case 'memberships': return setMemberships;
      case 'ordinations': return setOrdinations;
      default: return () => {};
    }
  };

  const renderTable = (data, columns, tableName) => {
    if (loading[tableName]) {
      return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-yellow-400" /></div>;
    }
    return (
      <Card className="bg-slate-900/50 border border-yellow-600/30 text-white">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="text-yellow-300 capitalize">{tableName}</CardTitle>
                <CardDescription className="text-blue-200">Total: {data.length}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => fetchData(tableName, getSetter(tableName))}>
                <RefreshCw className="h-4 w-4" />
            </Button>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow className="border-b-yellow-600/50">
                        {columns.map(col => <TableHead key={col.key} className="text-yellow-400">{col.label}</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map(item => (
                        <TableRow key={item.id} className="border-b-blue-900/50">
                            {columns.map(col => (
                                <TableCell key={col.key} className="py-3 text-blue-200 truncate" style={{maxWidth: '150px'}}>
                                    {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? 'N/A')}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    );
  };
  
  const profileColumns = [
    { key: 'display_name', label: 'Display Name' },
    { key: 'role', label: 'Role' },
    { key: 'wallet_xrpl', label: 'Wallet Address' },
    { key: 'created_at', label: 'Joined At', render: (val) => new Date(val).toLocaleDateString() },
  ];

  const donationColumns = [
    { key: 'user_id', label: 'User ID' },
    { key: 'amount_cents', label: 'Amount (Cents)', render: (val) => val },
    { key: 'currency', label: 'Currency' },
    { key: 'provider', label: 'Provider' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Timestamp', render: (val) => new Date(val).toLocaleString() },
  ];

  const scrollColumns = [
    { key: 'title', label: 'Title' },
    { key: 'pdf_path', label: 'PDF Path' },
    { key: 'published_at', label: 'Published At', render: (val) => new Date(val).toLocaleDateString() },
  ];
  
  const membershipColumns = [
    { key: 'user_id', label: 'User ID' },
    { key: 'status', label: 'Status' },
    { key: 'nft_token_id', label: 'NFT Token ID' },
    { key: 'created_at', label: 'Requested At', render: (val) => new Date(val).toLocaleDateString() },
    { key: 'updated_at', label: 'Updated At', render: (val) => new Date(val).toLocaleDateString() },
  ];
  
  const ordinationColumns = [
    { key: 'user_id', label: 'User ID' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Requested At', render: (val) => new Date(val).toLocaleDateString() },
    { key: 'updated_at', label: 'Updated At', render: (val) => new Date(val).toLocaleDateString() },
  ];

  return (
    <>
      <Helmet>
        <title>Admin Dashboard | Blockchain Ministries</title>
        <meta name="description" content="Manage members, donations, and sacred scrolls." />
      </Helmet>
      <div className="p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-2">Admin Sanctuary</h1>
          <p className="text-blue-200 mb-6">Oversee the sacred records of the ministry.</p>
        </motion.div>

        <Tabs defaultValue="profiles" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-slate-900/50 border border-yellow-600/30">
            <TabsTrigger value="profiles" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300"><Users className="mr-2 h-4 w-4" /> Profiles ({profiles.length})</TabsTrigger>
            <TabsTrigger value="memberships" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300"><ShieldCheck className="mr-2 h-4 w-4" /> Memberships ({memberships.length})</TabsTrigger>
            <TabsTrigger value="ordinations" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300"><Award className="mr-2 h-4 w-4" /> Ordinations ({ordinations.length})</TabsTrigger>
            <TabsTrigger value="donations" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300"><DollarSign className="mr-2 h-4 w-4" /> Donations ({donations.length})</TabsTrigger>
            <TabsTrigger value="scrolls" className="text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300"><BookOpen className="mr-2 h-4 w-4" /> Scrolls ({scrolls.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="profiles" className="mt-4">{renderTable(profiles, profileColumns, 'profiles')}</TabsContent>
          <TabsContent value="memberships" className="mt-4">{renderTable(memberships, membershipColumns, 'memberships')}</TabsContent>
          <TabsContent value="ordinations" className="mt-4">{renderTable(ordinations, ordinationColumns, 'ordinations')}</TabsContent>
          <TabsContent value="donations" className="mt-4">{renderTable(donations, donationColumns, 'donations')}</TabsContent>
          <TabsContent value="scrolls" className="mt-4">{renderTable(scrolls, scrollColumns, 'scrolls')}</TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default AdminDashboard;