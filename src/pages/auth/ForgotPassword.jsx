import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { AtSign, Send } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) {
      toast({
        title: "Error",
        description: error.message || "Could not send reset link.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Reset Link Sent",
        description: "Please check your email for a link to reset your password.",
      });
    }
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Forgot Password | Blockchain Ministries</title>
        <meta name="description" content="Reset your minister account password." />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="w-full max-w-md bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Reset Password</CardTitle>
              <CardDescription className="text-yellow-200/80">Enter your email to receive a reset link.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-blue-300 flex items-center"><AtSign className="w-4 h-4 mr-2"/>Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="minister@domain.org" />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                  <Send className="ml-2 h-4 w-4"/>
                </Button>
              </form>
              <div className="mt-6 text-center">
                <p className="text-sm text-blue-300">
                  Remembered your password?{' '}
                  <Link to="/login" className="font-bold text-yellow-400 hover:text-yellow-300">
                    Login
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default ForgotPassword;