import React, { useState, useEffect, useCallback, useRef, useId, useSyncExternalStore } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { api } from '@/lib/cloudflareApi';
import { CLOUDFLARE_ADMIN_PATH, mapAdminRow } from './adminOverview';
import { QUEUES } from './adminQueues';
import { createQueueStore, disclosedDetails, LOADING, READY, ERROR } from './adminQueueState';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Loader2, Users, DollarSign, BookOpen, RefreshCw, ShieldCheck, Award,
  Mail, ScrollText, CalendarClock, History, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';

/**
 * M13 Phase 4 — the four operational queues, in tab order.
 *
 * `value` is the queue key, so activating a tab names exactly one entry in
 * QUEUES. Everything else about these tabs — the endpoint, the columns, the
 * projection, the empty and error sentences — comes from Phase 3's contract.
 * Nothing about a field's safety is decided in this file.
 */
const OPERATIONAL_TABS = [
  { queue: QUEUES.inquiries, Icon: Mail },
  { queue: QUEUES.scrollRequests, Icon: ScrollText },
  { queue: QUEUES.consultations, Icon: CalendarClock },
  { queue: QUEUES.activity, Icon: History },
];

const TRIGGER_CLASS = 'text-blue-200 data-[state=active]:bg-slate-800 data-[state=active]:text-yellow-300';

const AdminDashboard = () => {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState([]);
  const [donations, setDonations] = useState([]);
  const [scrolls, setScrolls] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [ordinations, setOrdinations] = useState([]);
  const [loading, setLoading] = useState({});

  // One store per mount of the dashboard. Its cache is the "page session":
  // switching tabs costs nothing, leaving the admin area and returning starts
  // fresh, and nothing polls in the background.
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createQueueStore(api);
  const store = storeRef.current;

  const fetchData = useCallback(async (table, setter) => {
    setLoading(prev => ({ ...prev, [table]: true }));
    try {
      const res = await api.get(CLOUDFLARE_ADMIN_PATH[table]);
      setter((res.items || []).map((row) => mapAdminRow(table, row)));
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
        {/* M12: the table scrolls horizontally inside its own container instead
            of crushing every cell into a 150px truncation. Columns keep their
            natural width and stay aligned; the page itself never scrolls
            sideways. */}
        <CardContent className="px-0 sm:px-6">
            <div className="w-full overflow-x-auto">
                <Table className="min-w-[640px]">
                    <TableHeader>
                        <TableRow className="border-b-yellow-600/50">
                            {columns.map(col => <TableHead key={col.key} className="text-yellow-400 whitespace-nowrap">{col.label}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map(item => (
                            <TableRow key={item.id} className="border-b-blue-900/50">
                                {columns.map(col => (
                                    <TableCell key={col.key} className="py-3 text-blue-200 align-top max-w-[22rem] break-words">
                                        {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? 'N/A')}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
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
          {/* M13: nine tabs. A fixed grid would either crush the labels at 390px
              or force the page to scroll sideways, so the list wraps instead —
              every trigger keeps its full readable label at every width, and
              the page itself never overflows horizontally. */}
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-900/50 border border-yellow-600/30">
            <TabsTrigger value="profiles" className={TRIGGER_CLASS}><Users className="mr-2 h-4 w-4" /> Profiles ({profiles.length})</TabsTrigger>
            <TabsTrigger value="memberships" className={TRIGGER_CLASS}><ShieldCheck className="mr-2 h-4 w-4" /> Memberships ({memberships.length})</TabsTrigger>
            <TabsTrigger value="ordinations" className={TRIGGER_CLASS}><Award className="mr-2 h-4 w-4" /> Ordinations ({ordinations.length})</TabsTrigger>
            <TabsTrigger value="donations" className={TRIGGER_CLASS}><DollarSign className="mr-2 h-4 w-4" /> Donations ({donations.length})</TabsTrigger>
            <TabsTrigger value="scrolls" className={TRIGGER_CLASS}><BookOpen className="mr-2 h-4 w-4" /> Scrolls ({scrolls.length})</TabsTrigger>
            {/* No count on the operational tabs: they are not loaded until
                opened, and "(0)" before a fetch would be a false statement. */}
            {OPERATIONAL_TABS.map(({ queue, Icon }) => (
              <TabsTrigger key={queue.key} value={queue.key} className={TRIGGER_CLASS}>
                <Icon className="mr-2 h-4 w-4" /> {queue.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="profiles" className="mt-4">{renderTable(profiles, profileColumns, 'profiles')}</TabsContent>
          <TabsContent value="memberships" className="mt-4">{renderTable(memberships, membershipColumns, 'memberships')}</TabsContent>
          <TabsContent value="ordinations" className="mt-4">{renderTable(ordinations, ordinationColumns, 'ordinations')}</TabsContent>
          <TabsContent value="donations" className="mt-4">{renderTable(donations, donationColumns, 'donations')}</TabsContent>
          <TabsContent value="scrolls" className="mt-4">{renderTable(scrolls, scrollColumns, 'scrolls')}</TabsContent>
          {/* Radix mounts only the active panel's children, so a queue is not
              fetched — and its rows are not in the DOM — until its tab is
              actually opened. */}
          {OPERATIONAL_TABS.map(({ queue }) => (
            <TabsContent key={queue.key} value={queue.key} className="mt-4">
              <QueuePanel queue={queue} store={store} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
};

/* ==================================================================== *
 *  M13 operational queues — read-only.                                 *
 *                                                                      *
 *  There is no mutation control anywhere below: no status change, no    *
 *  reply, no schedule, no fulfil, no delete, no notification retry.     *
 *  None of those endpoints exist, and inventing a disabled button for   *
 *  each would only promise an authority the backend does not grant.     *
 * ==================================================================== */

/** Bind a queue's store slice to React. */
function useQueueState(store, key) {
  const subscribe = useCallback((fn) => store.subscribe(fn), [store]);
  const snapshot = useCallback(() => store.state(key), [store, key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function QueuePanel({ queue, store }) {
  const state = useQueueState(store, queue.key);

  // Mounting IS first activation — see the TabsContent note above. load() is
  // idempotent, so returning to an already-loaded tab re-runs this effect
  // without issuing a second request.
  useEffect(() => { store.load(queue.key); }, [store, queue.key]);

  const isActivity = queue.key === 'activity';

  return (
    <Card className="bg-slate-900/50 border border-yellow-600/30 text-white">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-yellow-300">{queue.label}</CardTitle>
          <CardDescription className="text-blue-200">
            {state.status === READY ? `Total: ${state.rows.length}` : 'Read-only'}
          </CardDescription>
        </div>
        {state.status === READY && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Refresh ${queue.label}`}
            onClick={() => store.refresh(queue.key)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {state.status === LOADING && (
          <div className="flex items-center justify-center gap-3 p-8" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-400" aria-hidden="true" />
            <span className="text-blue-200">Loading {queue.label.toLowerCase()}…</span>
          </div>
        )}

        {state.status === ERROR && (
          <div className="flex flex-col items-start gap-3 px-6 py-8 sm:px-0">
            {/* The queue's own fixed sentence — never the backend's message. */}
            <p role="alert" className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-yellow-600/50 text-yellow-300"
              onClick={() => store.refresh(queue.key)}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Retry
            </Button>
          </div>
        )}

        {state.status === READY && state.rows.length === 0 && (
          <p className="px-6 py-8 text-blue-200 sm:px-0">{queue.empty}</p>
        )}

        {state.status === READY && state.rows.length > 0 && (
          /* M12's admin table pattern: the table scrolls inside its own
             container at 390px; the page does not. */
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="border-b-yellow-600/50">
                  {queue.columns.map((col) => (
                    <TableHead key={col.key} className="text-yellow-400 whitespace-nowrap">{col.label}</TableHead>
                  ))}
                  {isActivity && (
                    <TableHead className="text-yellow-400"><span className="sr-only">Details</span></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((row, i) => (
                  isActivity
                    ? <ActivityRow key={row.id || i} row={row} source={state.sources[i]} columns={queue.columns} />
                    : <QueueRow key={row.id || i} row={row} columns={queue.columns} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A projected row. `row` only ever holds Phase 3 output — never an API row. */
function QueueRow({ row, columns }) {
  return (
    <TableRow className="border-b-blue-900/50">
      {columns.map((col) => (
        <TableCell
          key={col.key}
          className={`py-3 align-top text-blue-200 break-words ${col.wide ? 'min-w-[16rem] max-w-[26rem] whitespace-pre-wrap' : 'max-w-[18rem]'}`}
        >
          {row[col.key]}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * An activity row, plus its closed-by-default details disclosure.
 *
 * `source` is the raw audit row. It is NOT rendered and is not readable from
 * here by any other means: the single expression below hands it to
 * disclosedDetails(), which returns an empty list unless the admin has opened
 * this row. Nothing derived from it — including the private credential
 * revocation reason — exists in the DOM while the disclosure is closed. It is
 * absent, not hidden: there is no CSS, no `hidden` attribute and no title or
 * aria text carrying it.
 */
function ActivityRow({ row, source, columns }) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const detailsId = `${uid}-details`;
  const details = disclosedDetails(source, open);
  const failed = row.actionKey === 'notify.failed' || row.actionKey === 'credential.notify_failed';

  return (
    <>
      <TableRow className="border-b-blue-900/50">
        {columns.map((col) => (
          <TableCell key={col.key} className="py-3 align-top text-blue-200 break-words max-w-[18rem]">
            {/* A failed notification is marked by an icon AND the word
                "failed" in its own label — never by colour alone. */}
            {col.key === 'action' && failed ? (
              <span className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {row[col.key]}
              </span>
            ) : row[col.key]}
          </TableCell>
        ))}
        <TableCell className="py-3 align-top">
          {row.hasDetails && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((v) => !v)}
              className="text-yellow-300 hover:text-yellow-200 focus-visible:ring-2 focus-visible:ring-yellow-400"
            >
              {open
                ? <ChevronDown className="mr-1 h-4 w-4" aria-hidden="true" />
                : <ChevronRight className="mr-1 h-4 w-4" aria-hidden="true" />}
              {open ? 'Hide details' : 'View details'}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {open && details.length > 0 && (
        <TableRow id={detailsId} className="border-b-blue-900/50 bg-slate-950/40">
          <TableCell colSpan={columns.length + 1} className="py-3 text-blue-200">
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
              {details.map((d) => (
                <React.Fragment key={d.key}>
                  <dt className="text-yellow-400/80">{d.label}</dt>
                  <dd className="break-words">{d.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default AdminDashboard;
