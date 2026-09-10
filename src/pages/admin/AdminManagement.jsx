import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { api } from '@/lib/cloudflareApi';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, ShieldCheck, Award, BadgeCheck, Ban, RotateCcw } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { credentialAction, validateReason, confirmCopy, REASON_MAX } from './credentialActions';

const AdminManagement = () => {
  const { toast } = useToast();
  const [pendingMemberships, setPendingMemberships] = useState([]);
  const [pendingOrdinations, setPendingOrdinations] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  // { action: 'revoke'|'reissue', item } — null when no dialog is open.
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // requireAdmin re-checks users.role in D1 server-side regardless of
      // what the client believes — a member session gets a 403 here.
      const [membershipsRes, ordinationsRes, approvedRes] = await Promise.all([
        api.get('/admin/memberships?status=pending'),
        api.get('/admin/ordinations?status=pending'),
        api.get('/admin/ordinations?status=approved'),
      ]);
      setPendingMemberships(membershipsRes.items || []);
      setPendingOrdinations(ordinationsRes.items || []);
      setCredentials(approvedRes.items || []);
    } catch (error) {
      toast({ title: 'Error fetching data', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * M11 lifecycle actions. Both go through an explicit confirmation dialog —
   * revocation in particular must never be one accidental click away — and
   * revocation additionally requires a non-blank reason, validated here before
   * the request and again server-side.
   */
  const runLifecycleAction = async () => {
    if (!dialog) return;
    const { action, item } = dialog;

    let body;
    if (action === 'revoke') {
      const check = validateReason(reason);
      if (!check.ok) {
        setReasonError(check.error);
        return;
      }
      body = { reason: check.value };
    }

    setProcessingId(item.id);
    try {
      const res = await api.post(`/admin/ordinations/${item.id}/${action}`, body);
      toast({
        title: action === 'revoke' ? 'Credential Revoked' : 'Credential Reissued',
        description: res.notification === 'sent'
          ? 'The minister has been notified by email.'
          : 'State updated, but the notification email could not be delivered.',
        className: action === 'revoke' ? 'bg-yellow-800 text-white' : 'bg-green-800 text-white',
      });
      closeDialog();
      fetchData();
    } catch (error) {
      toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const closeDialog = () => {
    setDialog(null);
    setReason('');
    setReasonError(null);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApproveMembership = async (membershipId) => {
    setProcessingId(membershipId);
    try {
      // approved_by is derived from the admin's own session server-side —
      // never sent by the client.
      await api.post(`/admin/memberships/${membershipId}/approve`);
      toast({ title: 'Membership Approved', description: 'Status updated.', className: 'bg-green-800 text-white' });
      fetchData();
    } catch (error) {
      // error.message already carries a safe, specific reason for 403/404/409
      // (e.g. "Membership is already approved") — surfaced as-is.
      toast({ title: 'Approval Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveOrdination = async (ordinationId) => {
    setProcessingId(ordinationId);
    try {
      await api.post(`/admin/ordinations/${ordinationId}/approve`);
      toast({ title: 'Ordination Approved', description: 'Status updated. Credential generation is not yet available.', className: 'bg-green-800 text-white' });
      fetchData();
    } catch (error) {
      toast({ title: 'Approval Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (type, id) => {
    setProcessingId(id);
    try {
      await api.post(`/admin/${type === 'membership' ? 'memberships' : 'ordinations'}/${id}/reject`);
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
    const email = item.email || 'N/A';
    const displayName = item.display_name || 'N/A';

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
              onClick={() => handleReject(type, item.id)}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              <span className="ml-2">Reject</span>
            </Button>
          </div>
        </div>
        {type === 'ordination' && (() => {
          // D1 stores application_json as TEXT (no native JSON type).
          const application = (() => { try { return JSON.parse(item.application_json); } catch { return {}; } })();
          return (
            <div className="mt-4 p-3 bg-slate-900/70 rounded-md text-sm">
              <p className="font-semibold text-yellow-400">Reason:</p>
              <p className="text-blue-200 whitespace-pre-wrap">{application.reason}</p>
              <p className="font-semibold text-yellow-400 mt-2">Experience:</p>
              <p className="text-blue-200 whitespace-pre-wrap">{application.experience}</p>
            </div>
          );
        })()}
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
          <TabsList className="grid w-full grid-cols-3 bg-blue-950/50 border border-yellow-400/20">
            <TabsTrigger value="memberships">
              <ShieldCheck className="w-4 h-4 mr-2" /> Memberships ({pendingMemberships.length})
            </TabsTrigger>
            <TabsTrigger value="ordinations">
              <Award className="w-4 h-4 mr-2" /> Ordinations ({pendingOrdinations.length})
            </TabsTrigger>
            <TabsTrigger value="credentials">
              <BadgeCheck className="w-4 h-4 mr-2" /> Credentials ({credentials.length})
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

          {/* M11 — issued credential lifecycle. */}
          <TabsContent value="credentials" className="mt-6">
            <Card className="celestial-bg border-yellow-400/20">
              <CardHeader>
                <CardTitle>Issued Credentials</CardTitle>
                <CardDescription>Revoke or reissue ministerial credentials. Both actions notify the minister.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {credentials.length === 0 && (
                  <p className="text-center text-blue-300 py-8">No approved ordinations yet.</p>
                )}
                {credentials.map(item => {
                  const info = credentialAction(item);
                  const isProcessing = processingId === item.id;
                  return (
                    <div key={item.id} className="p-4 bg-slate-800/50 rounded-lg border border-yellow-400/20 flex flex-wrap justify-between items-start gap-3">
                      <div>
                        <p className="font-bold text-yellow-300">{item.display_name || item.email || 'Minister'}</p>
                        <p className="text-xs text-blue-300 mt-1">
                          <span className="text-yellow-400">Credential No.:</span>{' '}
                          <span className="font-mono">{info.credentialNumber || '—'}</span>
                          {info.version ? <span className="ml-2 text-blue-400">v{info.version}</span> : null}
                        </p>
                        <p className={`text-xs font-bold mt-1 ${
                          info.state === 'valid' ? 'text-green-300' :
                          info.state === 'revoked' ? 'text-red-300' : 'text-blue-300'
                        }`}>{info.label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {info.action === 'revoke' && (
                          <Button
                            size="sm" variant="outline" disabled={isProcessing}
                            className="border-red-500 text-red-400 hover:bg-red-500/10"
                            onClick={() => { setReason(''); setReasonError(null); setDialog({ action: 'revoke', item }); }}
                          >
                            <Ban className="w-4 h-4 mr-2" /> Revoke Credential
                          </Button>
                        )}
                        {info.action === 'reissue' && (
                          <Button
                            size="sm" variant="outline" disabled={isProcessing}
                            className="border-green-500 text-green-400 hover:bg-green-500/10"
                            onClick={() => { setReason(''); setReasonError(null); setDialog({ action: 'reissue', item }); }}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" /> Reissue Credential
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Explicit confirmation — neither action is ever one click away. */}
      <AlertDialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <AlertDialogContent className="bg-slate-900 border-yellow-400/30 text-white">
          {dialog && (() => {
            const copy = confirmCopy(dialog.action, credentialAction(dialog.item).credentialNumber);
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-yellow-300">{copy.title}</AlertDialogTitle>
                  <AlertDialogDescription className="text-blue-200">{copy.body}</AlertDialogDescription>
                </AlertDialogHeader>

                {dialog.action === 'revoke' && (
                  <div className="space-y-2">
                    <Label htmlFor="revoke-reason" className="text-yellow-300">
                      Internal reason (required — never shown to the minister or the public)
                    </Label>
                    <Textarea
                      id="revoke-reason"
                      value={reason}
                      onChange={(e) => { setReason(e.target.value); setReasonError(null); }}
                      maxLength={REASON_MAX}
                      placeholder="Recorded in the admin audit log only."
                      className="bg-blue-950/50 border-yellow-400/30 text-white"
                    />
                    {reasonError && <p className="text-sm text-red-400">{reasonError}</p>}
                  </div>
                )}

                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-transparent border-yellow-400/40 text-yellow-300">Cancel</AlertDialogCancel>
                  <Button
                    onClick={runLifecycleAction}
                    disabled={processingId === dialog.item.id}
                    className={dialog.action === 'revoke'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'}
                  >
                    {processingId === dialog.item.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {copy.confirmLabel}
                  </Button>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminManagement;