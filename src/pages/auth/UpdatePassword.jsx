import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { KeyRound, ShieldCheck } from 'lucide-react';

const UpdatePassword = () => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { updatePassword, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!session) {
      toast({
        title: "Invalid Session",
        description: "You must be logged in to update your password. Redirecting to login.",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [session, navigate, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await updatePassword(password);
    if (error) {
      toast({
        title: "Error",
        description: error.message || "Could not update password.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Password Updated",
        description: "Your sacred key has been successfully updated.",
      });
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Update Password | Blockchain Ministries</title>
        <meta name="description" content="Update your minister account password." />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="w-full max-w-md bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Update Your Password</CardTitle>
              <CardDescription className="text-yellow-200/80">Enter a new password for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-blue-300 flex items-center"><KeyRound className="w-4 h-4 mr-2"/>New Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="Enter your new sacred key" />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500">
                  {loading ? 'Updating...' : 'Update Password'}
                  <ShieldCheck className="ml-2 h-4 w-4"/>
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default UpdatePassword;