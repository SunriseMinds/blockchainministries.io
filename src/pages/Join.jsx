import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { UserPlus, CheckCircle, Star, BookOpen, Vote, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100 } },
};

const Join = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [membershipType, setMembershipType] = useState('paid');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('join-membership', {
        body: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          membershipType: membershipType,
        },
      });

      if (error) throw new Error(error.message);
      
      if (membershipType === 'paid' && data.sessionId) {
        toast({
          title: 'Redirecting to Payment...',
          description: 'Please complete your payment to activate your membership.',
        });
        const stripe = await stripePromise;
        await stripe.redirectToCheckout({ sessionId: data.sessionId });
      } else {
        setSubmitted(true);
        toast({
          title: 'Welcome!',
          description: 'Thank you for joining! Please check your email to confirm your account.',
          className: 'bg-green-800 text-white',
        });
      }

    } catch (err) {
      const errorMessage = err.message.includes('User already registered')
        ? 'A user with this email already exists. Please log in.'
        : err.message || 'An unexpected error occurred.';
      
      toast({
        title: 'Sign-up Failed',
        description: errorMessage,
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
          <h1 className="text-4xl font-bold text-yellow-300 sacred-font mb-4">Welcome to the Covenant!</h1>
          <p className="text-blue-200 max-w-md mx-auto">
            A confirmation email has been sent to your address. Please click the link inside to verify your account and begin your journey.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Join the Covenant - Blockchain Ministries</title>
        <meta name="description" content="Become a member of Blockchain Ministries. Choose between a free or paid membership to unlock sacred knowledge and community benefits." />
      </Helmet>
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        
        <motion.section
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="text-center mb-20"
        >
          <div className="inline-block p-4 bg-yellow-400/10 rounded-full mb-4 sacred-pulse">
            <UserPlus className="w-16 h-16 text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.7))' }} />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font" style={{ textShadow: '0 0 20px rgba(253, 224, 71, 0.4)' }}>
            Join the Sacred Covenant
          </h1>
          <p className="text-xl text-blue-200 italic max-w-3xl mx-auto">
            Step into a community of light. Your membership supports our mission to protect sacred knowledge and build a sovereign digital ministry.
          </p>
        </motion.section>

        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="max-w-6xl mx-auto mb-24"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            {/* Membership Tiers */}
            <div className="space-y-8">
              <h2 className="text-4xl font-bold text-center sacred-font gradient-text mb-8">Membership Options</h2>
              {/* Free Tier */}
              <motion.div variants={itemVariants}>
                <Card className={`celestial-bg border-yellow-400/20 transition-all duration-300 ${membershipType === 'free' ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20' : ''}`}>
                  <CardHeader>
                    <CardTitle className="text-2xl sacred-font text-yellow-300">Supporter</CardTitle>
                    <CardDescription className="text-blue-300">
                      <span className="text-4xl font-bold text-white">Free</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      <li className="flex items-center"><Mail className="w-5 h-5 text-green-500 mr-3" /><span>Monthly newsletter and updates</span></li>
                      <li className="flex items-center"><CheckCircle className="w-5 h-5 text-green-500 mr-3" /><span>Limited access to community events</span></li>
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={() => setMembershipType('free')} className={`w-full ${membershipType === 'free' ? 'bg-yellow-500 text-black' : 'bg-blue-800'}`}>
                      {membershipType === 'free' ? 'Selected' : 'Select'}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
              {/* Paid Tier */}
              <motion.div variants={itemVariants}>
                <Card className={`celestial-bg border-yellow-400/20 transition-all duration-300 ${membershipType === 'paid' ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20' : ''}`}>
                  <CardHeader>
                    <CardTitle className="text-2xl sacred-font text-yellow-300">Covenant Member</CardTitle>
                    <CardDescription className="text-blue-300">
                      <span className="text-4xl font-bold text-white">$10</span> / month
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      <li className="flex items-center"><BookOpen className="w-5 h-5 text-green-500 mr-3" /><span>Full access to all Sacred Scrolls</span></li>
                      <li className="flex items-center"><Star className="w-5 h-5 text-green-500 mr-3" /><span>Monthly EFT token rewards</span></li>
                      <li className="flex items-center"><Vote className="w-5 h-5 text-green-500 mr-3" /><span>Participation in DAO governance</span></li>
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={() => setMembershipType('paid')} className={`w-full ${membershipType === 'paid' ? 'bg-yellow-500 text-black' : 'bg-blue-800'}`}>
                      {membershipType === 'paid' ? 'Selected' : 'Select'}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            </div>

            {/* Sign-up Form */}
            <motion.div variants={itemVariants}>
              <Card className="celestial-bg border-yellow-400/20">
                <CardHeader>
                  <CardTitle className="text-3xl text-center sacred-font text-yellow-300">Create Your Account</CardTitle>
                  <CardDescription className="text-center text-blue-300">Begin your journey with us today.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName" className="text-yellow-300">First Name</Label>
                        <Input id="firstName" type="text" value={formData.firstName} onChange={handleInputChange} required className="bg-blue-900/50 border-yellow-400/30 text-white" />
                      </div>
                      <div>
                        <Label htmlFor="lastName" className="text-yellow-300">Last Name</Label>
                        <Input id="lastName" type="text" value={formData.lastName} onChange={handleInputChange} required className="bg-blue-900/50 border-yellow-400/30 text-white" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-yellow-300">Email</Label>
                      <Input id="email" type="email" value={formData.email} onChange={handleInputChange} required className="bg-blue-900/50 border-yellow-400/30 text-white" />
                    </div>
                    <div>
                      <Label htmlFor="password" className="text-yellow-300">Password</Label>
                      <Input id="password" type="password" value={formData.password} onChange={handleInputChange} required minLength="6" className="bg-blue-900/50 border-yellow-400/30 text-white" />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold text-lg py-6 mt-4">
                      {loading ? <Loader2 className="animate-spin mr-2" /> : <UserPlus className="mr-2" />}
                      Join Now
                    </Button>
                    <p className="text-xs text-blue-400 text-center pt-2">
                      By joining, you agree to our sacred covenant and privacy policy. Your information is protected under our Private Member Association.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.section>
      </div>
    </>
  );
};

export default Join;