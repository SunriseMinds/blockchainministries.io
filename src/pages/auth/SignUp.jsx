import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthProvider';
import { USE_CLOUDFLARE_API } from '@/lib/cloudflareApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { KeyRound, AtSign, User, ShieldCheck } from 'lucide-react';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const trustlineUrl = "https://xrpl.services?issuer=rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw&currency=EFT&limit=100000000";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // M9.8: Cloudflare-mode accounts are passwordless (magic-link login) —
    // no password is ever collected or sent for them. Supabase mode is
    // unchanged and still needs one.
    const { data, error } = await signUp({
      email,
      ...(USE_CLOUDFLARE_API ? {} : { password }),
      options: {
        data: {
          full_name: fullName,
        }
      }
    });
    setLoading(false);

    if (error) {
      if (error.message.includes("Password should contain")) {
        toast({
          title: "Weak Password",
          description: "Please use a stronger password, including uppercase, lowercase, numbers, and symbols.",
          variant: "destructive",
        });
      } else if (error.message.includes("Error sending confirmation email")) {
        toast({
          title: "Account Created, Email Failed",
          description: "Your account is registered, but the confirmation email failed. Please use the 'Forgot Password' link on the login page to verify your account.",
          variant: "default",
          duration: 15000,
        });
        navigate('/login');
      } else if (error.message.includes("rate limit exceeded")) {
        toast({
            title: "Account Created, Email Delayed",
            description: "We've hit our email sending limit. Your account is ready, but please use 'Forgot Password' on the login page in a few minutes to verify.",
            variant: "default",
            duration: 15000,
        });
        navigate('/login');
      } else {
        toast({
          title: "Sign Up Failed",
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }

    if (USE_CLOUDFLARE_API) {
      // Cloudflare's response shape is {ok, message, email_sent} — not
      // Supabase's {user, identities}. The account is created either way;
      // email_sent only tells us whether the verification email itself went
      // out, and a false value must never read as "sign up failed."
      if (data?.email_sent === false) {
        toast({
          title: 'Account Created, Email Failed',
          description: "Your account was created, but the login link couldn't be sent. Please try again later or contact us to access your account.",
          variant: 'default',
          duration: 15000,
        });
      } else {
        toast({
          title: 'Login Link Sent',
          description: 'Check your inbox for a link to log in and complete your covenant.',
        });
      }
      navigate('/login');
      return;
    }

    if (data.user && data.user.identities && data.user.identities.length === 0) {
      toast({
        title: "Email Already Registered",
        description: "This email is already registered. Please login or check your inbox for the verification link.",
        variant: "default",
      });
      navigate('/login');
      return;
    }

    if (data.user) {
      toast({
        title: "Verification Email Sent",
        description: "Please check your inbox to verify your email and complete your covenant.",
      });
      navigate('/login');
    } else {
      toast({
        title: "Account Already Exists",
        description: "An account with this email already exists and is confirmed. Please login.",
        variant: "default",
      });
      navigate('/login');
    }
  };

  return (
    <>
      <Helmet>
        <title>Join the Covenant | Blockchain Ministries</title>
        <meta name="description" content="Create your minister account and join the sacred covenant." />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-[#0A192F] to-black">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="w-full max-w-md bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
            <CardHeader className="text-center">
              <Link to="/" className="inline-block">
                <svg className="w-16 h-16 mx-auto text-yellow-400 mb-4 hover:text-yellow-300 transition-colors" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </Link>
              <CardTitle className="text-3xl font-serif text-yellow-400 tracking-wider">Join the Covenant</CardTitle>
              <CardDescription className="text-yellow-200/80">Create your sacred account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-blue-300 flex items-center"><User className="w-4 h-4 mr-2"/>Full Name</Label>
                  <Input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="Your full name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-blue-300 flex items-center"><AtSign className="w-4 h-4 mr-2"/>Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="minister@domain.org" />
                </div>
                {USE_CLOUDFLARE_API ? (
                  <p className="text-xs text-blue-300/70">
                    No password needed — we'll email you a link to log in.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-blue-300 flex items-center"><KeyRound className="w-4 h-4 mr-2"/>Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-blue-900/50 border-yellow-400/30 text-white placeholder:text-blue-300/70" placeholder="Choose a strong password" />
                    <p className="text-xs text-blue-300/70 pt-1">
                      Must include uppercase, lowercase, a number, and a symbol.
                    </p>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold hover:from-yellow-300 hover:to-amber-500">
                  {loading ? 'Creating Covenant...' : 'Sign Up'}
                  <ShieldCheck className="ml-2 h-4 w-4"/>
                </Button>
              </form>
              <div className="mt-6 text-center space-y-4">
                <p className="text-sm text-blue-300">
                  Want to hold EFT?{' '}
                  <a href={trustlineUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-yellow-400 hover:text-yellow-300 underline">
                    Set your TrustLine
                  </a>
                </p>
                <p className="text-sm text-blue-300">
                  Already have a covenant?{' '}
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

export default SignUp;