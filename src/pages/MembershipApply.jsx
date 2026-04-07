import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MembershipApply = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    walletXrpl: '',
  });

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast({ title: 'Authentication Required', description: 'You must be logged in to apply.', variant: 'destructive' });
      navigate('/login');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('apply-for-membership', {
        body: {
          displayName: formData.displayName,
          walletXrpl: formData.walletXrpl,
        },
      });

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: 'Application Submitted!',
        description: 'Your request for membership is under review by the council.',
        className: 'bg-green-800/80 border-green-400 text-white backdrop-blur-md',
      });
    } catch (error) {
      console.error('Error submitting membership application:', error);
      toast({
        title: 'Application Error',
        description: error.message || 'There was a problem submitting your application.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-8"
        >
          <CheckCircle className="w-24 h-24 mx-auto text-green-400 mb-6" />
          <h1 className="text-4xl font-bold text-yellow-300 sacred-font mb-4">Application Received</h1>
          <p className="text-blue-200 max-w-md mx-auto">
            Thank you. Your covenant request has been sent to the council for review. You will be notified upon approval.
          </p>
          <Button onClick={() => navigate('/dashboard')} className="mt-8">
            Return to Dashboard
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Membership Application - Blockchain Ministries</title>
        <meta name="description" content="Apply for covenant membership with Blockchain Ministries." />
      </Helmet>
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-2xl"
        >
          <Card className="celestial-bg border-yellow-400/20">
            <CardHeader className="text-center">
              <Shield className="w-16 h-16 mx-auto text-yellow-400 mb-4" />
              <CardTitle className="text-3xl text-yellow-300 sacred-font">Covenant Membership Application</CardTitle>
              <CardDescription className="text-blue-300">Join our sacred fellowship and gain access to our private member association.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="displayName" className="text-yellow-300">Display Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    value={formData.displayName}
                    onChange={handleChange}
                    placeholder="Your public name in the ministry"
                    required
                    className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
                  />
                </div>
                <div>
                  <Label htmlFor="walletXrpl" className="text-yellow-300">XRPL Wallet Address (Optional)</Label>
                  <Input
                    id="walletXrpl"
                    type="text"
                    value={formData.walletXrpl}
                    onChange={handleChange}
                    placeholder="r..."
                    className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
                  />
                  <p className="text-xs text-blue-400 mt-2">Provide this if you wish to receive a Membership NFT upon approval.</p>
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : <Shield className="mr-2" />}
                  Submit Application
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default MembershipApply;