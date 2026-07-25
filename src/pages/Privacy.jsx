import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const LAST_UPDATED = 'July 23, 2026';

const Section = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-2xl md:text-3xl font-bold text-yellow-300 sacred-font mb-4">{title}</h2>
    <div className="space-y-4 text-blue-100 leading-relaxed">{children}</div>
  </section>
);

const Privacy = () => {
  return (
    <>
      <Helmet>
        <title>Privacy Policy - Blockchain Ministries</title>
        <meta name="description" content="How Blockchain Ministries collects, uses, and protects personal information across its ecclesiastical services and digital platform." />
        <link rel="canonical" href="https://blockchainministries.io/privacy" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-black to-blue-950 text-yellow-100 py-12 px-4 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <div className="inline-block p-4 bg-yellow-400/10 rounded-full mb-4 sacred-pulse">
            <ShieldCheck className="w-14 h-14 text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.7))' }} />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font">
            Privacy Policy
          </h1>
          <p className="text-blue-200 italic">Last updated: {LAST_UPDATED}</p>
        </motion.header>

        <div className="max-w-3xl mx-auto">
          <div className="flex items-start gap-3 mb-10 p-4 rounded-lg border border-yellow-400/40 bg-yellow-400/5">
            <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0 mt-1" />
            <p className="text-sm text-yellow-100">
              <strong>Draft for review.</strong> This Privacy Policy is a good-faith draft prepared for
              organizational and legal review. It is not legal advice and should be reviewed and approved by
              qualified counsel before being relied upon.
            </p>
          </div>

          <Section title="1. Who We Are">
            <p>
              Blockchain Ministries (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a sovereign ecclesiastical
              trust operating the website at <span className="text-yellow-300">blockchainministries.io</span>. This policy
              explains what information we collect, how we use it, and the choices you have.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect information you provide directly, including when you:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Create an account or sign in (name, email address, and authentication credentials).</li>
              <li>Apply for ordination or membership, or submit an inquiry or scroll request (contact and application details).</li>
              <li>Make a donation (transaction details processed by our payment partners).</li>
              <li>Connect a digital wallet for token or trustline actions (public wallet address only).</li>
            </ul>
            <p>
              We do not knowingly collect private wallet keys or seed phrases, and you should never share them with us or
              enter them on this site.
            </p>
          </Section>

          <Section title="3. How We Use Information">
            <ul className="list-disc list-inside space-y-1">
              <li>To provide ecclesiastical services, process applications, and maintain member records.</li>
              <li>To communicate regarding your account, requests, and correspondence.</li>
              <li>To process donations and issue related acknowledgements.</li>
              <li>To operate, secure, and improve our platform.</li>
            </ul>
          </Section>

          <Section title="4. Service Providers">
            <p>We rely on trusted third-party services that may process limited data on our behalf:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Supabase</strong> — authentication and application database.</li>
              <li><strong>Firebase</strong> — the ministers directory (transitional).</li>
              <li><strong>Stripe</strong> and <strong>PayPal</strong> — donation and payment processing.</li>
              <li><strong>Coinbase Commerce</strong> — cryptocurrency donation processing, where offered.</li>
              <li><strong>XRP Ledger / Xaman (XUMM)</strong> — on-chain token and trustline interactions you initiate.</li>
            </ul>
            <p>Each provider processes data under its own privacy terms.</p>
          </Section>

          <Section title="5. Cookies &amp; Local Storage">
            <p>
              We use essential browser storage to keep you signed in and to remember basic preferences. We do not use this
              storage to build advertising profiles.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p>
              We retain personal information for as long as needed to provide our services and to meet legitimate
              record-keeping, legal, and ecclesiastical obligations.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>
              Subject to applicable law, you may request access to, correction of, or deletion of your personal
              information. To make a request, contact us using the details below.
            </p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>Our services are not directed to children, and we do not knowingly collect information from them.</p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this policy from time to time. Material changes will be reflected by updating the
              &ldquo;Last updated&rdquo; date above.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Questions about this policy may be directed to{' '}
              <a href="mailto:contact@blockchainministries.io" className="text-yellow-300 hover:underline">contact@blockchainministries.io</a>.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
};

export default Privacy;
