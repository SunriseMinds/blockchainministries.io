import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { api, USE_CLOUDFLARE_API } from '@/lib/cloudflareApi';
import { useAuth } from '@/contexts/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Shield, Clock, BadgeCheck, XCircle } from 'lucide-react';
import { shouldShowApplyCta } from './membershipCta';
import { toDisplayMembership } from './membershipDisplay';

const MembershipDetail = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMembership = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (USE_CLOUDFLARE_API) {
        const res = await api.get('/membership/mine');
        setMembership(toDisplayMembership(res.membership));
        return;
      }

      const { data, error } = await supabase
        .from('memberships')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      setMembership(toDisplayMembership(data));
    } catch (error) {
      console.error('Error fetching membership record:', error);
      toast({
        title: 'Error',
        description: 'Could not load your membership record. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchMembership();
  }, [fetchMembership]);

  let statusIcon, statusText, statusColor, description;
  switch (membership?.status) {
    case 'approved':
      statusIcon = <BadgeCheck className="w-8 h-8" />;
      statusText = 'Approved Member';
      statusColor = 'text-green-400';
      description = 'Your covenant is sealed. Welcome to the fellowship.';
      break;
    case 'pending':
      statusIcon = <Clock className="w-8 h-8" />;
      statusText = 'Membership Pending';
      statusColor = 'text-yellow-400';
      description = 'Your application is under review by the council.';
      break;
    case 'rejected':
      statusIcon = <XCircle className="w-8 h-8" />;
      statusText = 'Membership Rejected';
      statusColor = 'text-red-400';
      description = 'Please contact support for more information.';
      break;
    default:
      statusIcon = <Shield className="w-8 h-8" />;
      statusText = 'Not a Member';
      statusColor = 'text-blue-300';
      description = 'Apply for membership to unlock sacred benefits.';
  }

  return (
    <>
      <Helmet>
        <title>Membership Status | Blockchain Ministries</title>
        <meta name="description" content="View your covenant membership status." />
      </Helmet>
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="text-blue-300 hover:text-yellow-300 mb-4 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold text-yellow-300 sacred-font mb-6">Membership Status</h1>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
            <p className="ml-4 text-yellow-400">Loading membership record...</p>
          </div>
        ) : (
          <Card className="bg-slate-900/50 border border-yellow-600/30 text-white">
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${statusColor}`}>{statusIcon} {statusText}</CardTitle>
              <CardDescription className="text-blue-300">{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {membership?.membershipType && (
                <p className="text-sm text-blue-200">
                  <span className="font-bold text-yellow-200">Membership Type:</span>{' '}
                  <span className="capitalize">{membership.membershipType}</span>
                </p>
              )}
              {membership?.paymentStatus && (
                <p className="text-sm text-blue-200">
                  <span className="font-bold text-yellow-200">Payment Status:</span>{' '}
                  <span className="capitalize">{membership.paymentStatus.replace('_', ' ')}</span>
                </p>
              )}
              {membership?.status === 'approved' && membership.nftTokenId && (
                <div>
                  <p className="text-sm font-bold text-yellow-200">Your Membership NFT</p>
                  <a
                    href={`https://livenet.xrpl.org/nft/${membership.nftTokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-300 break-all hover:text-yellow-400"
                  >
                    {membership.nftTokenId}
                  </a>
                </div>
              )}
              {shouldShowApplyCta(membership) && (
                <Button asChild className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold">
                  <Link to="/membership/apply">
                    <Shield className="w-4 h-4 mr-2" /> Apply for Membership
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
};

export default MembershipDetail;
