import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Ordination = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    reason: '',
    experience: '',
  });

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast({ title: 'Authentication Required', description: 'You must be logged in to apply for ordination.', variant: 'destructive' });
      navigate('/login');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('apply-for-ordination', {
        body: { application_json: formData },
      });

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: 'Ordination Request Submitted!',
        description: 'Your application is under review. You will be notified upon approval.',
        className: 'bg-green-800/80 border-green-400 text-white backdrop-blur-md',
      });
    } catch (error) {
      console.error('Error submitting ordination application:', error);
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
            Thank you. Your ordination request has been sent to the council for review. You will be notified upon approval.
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
        <title>Minister Ordination - Blockchain Ministries</title>
        <meta name="description" content="Apply for ministerial ordination and receive your sacred credentials on the blockchain." />
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
              <Award className="w-16 h-16 mx-auto text-yellow-400 mb-4" />
              <CardTitle className="text-3xl text-yellow-300 sacred-font">Minister Ordination Application</CardTitle>
              <CardDescription className="text-blue-300">Request full ministerial ordination with ecclesiastical authority.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="fullName" className="text-yellow-300">Full Legal Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="Your full name as it should appear on credentials"
                    required
                    className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
                  />
                </div>
                <div>
                  <Label htmlFor="reason" className="text-yellow-300">Reason for Seeking Ordination</Label>
                  <Textarea
                    id="reason"
                    value={formData.reason}
                    onChange={handleChange}
                    placeholder="Describe your spiritual calling and purpose."
                    required
                    className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
                  />
                </div>
                <div>
                  <Label htmlFor="experience" className="text-yellow-300">Relevant Experience or Studies</Label>
                  <Textarea
                    id="experience"
                    value={formData.experience}
                    onChange={handleChange}
                    placeholder="Outline any previous ministry, spiritual studies, or relevant life experience."
                    className="bg-blue-900/50 border-yellow-400/30 text-white placeholder-blue-300"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6">
                  {loading ? <Loader2 className="animate-spin mr-2" /> : <Award className="mr-2" />}
                  Request Ordination
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Ordination;