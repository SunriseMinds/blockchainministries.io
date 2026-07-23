import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ScrollText, AlertTriangle } from 'lucide-react';

const LAST_UPDATED = 'July 23, 2026';

const Section = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-2xl md:text-3xl font-bold text-yellow-300 sacred-font mb-4">{title}</h2>
    <div className="space-y-4 text-blue-100 leading-relaxed">{children}</div>
  </section>
);

const Terms = () => {
  return (
    <>
      <Helmet>
        <title>Terms of Service - Blockchain Ministries</title>
        <meta name="description" content="The terms governing use of the Blockchain Ministries website, ecclesiastical services, EFT token information, and donations." />
        <link rel="canonical" href="https://blockchainministries.io/terms" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-black to-blue-950 text-yellow-100 py-12 px-4 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <div className="inline-block p-4 bg-yellow-400/10 rounded-full mb-4 sacred-pulse">
            <ScrollText className="w-14 h-14 text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(253, 224, 71, 0.7))' }} />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 mb-4 sacred-font">
            Terms of Service
          </h1>
          <p className="text-blue-200 italic">Last updated: {LAST_UPDATED}</p>
        </motion.header>

        <div className="max-w-3xl mx-auto">
          <div className="flex items-start gap-3 mb-10 p-4 rounded-lg border border-yellow-400/40 bg-yellow-400/5">
            <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0 mt-1" />
            <p className="text-sm text-yellow-100">
              <strong>Draft for review.</strong> These Terms are a good-faith draft prepared for organizational and legal
              review. They are not legal advice and must be reviewed and approved by qualified counsel before being relied
              upon.
            </p>
          </div>

          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using <span className="text-yellow-300">blockchainministries.io</span> (the &ldquo;Site&rdquo;),
              you agree to these Terms of Service. If you do not agree, please do not use the Site.
            </p>
          </Section>

          <Section title="2. Nature of the Organization">
            <p>
              Blockchain Ministries is a sovereign ecclesiastical trust. Ordinations, memberships, titles, scrolls, and
              recognitions are ecclesiastical and spiritual in nature. They do not, by themselves, confer civil,
              governmental, tax, immigration, or diplomatic status unless separately and lawfully recognized by a competent
              authority.
            </p>
          </Section>

          <Section title="3. Accounts">
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activity under
              your account. Notify us promptly of any unauthorized use.
            </p>
          </Section>

          <Section title="4. Ordination &amp; Membership">
            <p>
              Applications for ordination or membership are reviewed at our discretion. We may approve, decline, or revoke
              any application or standing in accordance with our ecclesiastical governance.
            </p>
          </Section>

          <Section title="5. Donations">
            <p>
              Donations support the mission of Blockchain Ministries. Unless expressly stated in writing, donations are
              voluntary and non-refundable. No goods or services are guaranteed in exchange for a donation. Any statements
              regarding tax treatment are informational only and are not tax advice.
            </p>
          </Section>

          <Section title="6. EFT Token &amp; Blockchain Interactions">
            <p>
              Information about the EFT token and XRP Ledger trustlines is provided for informational and ecclesiastical
              purposes only. It is <strong>not</strong> financial, investment, or legal advice, and nothing on the Site is an
              offer or solicitation to buy or sell any asset.
            </p>
            <p>
              Blockchain transactions are irreversible and carry inherent risk. You are solely responsible for your wallets,
              keys, and on-chain actions. Never share your private keys or seed phrase with anyone, including us.
            </p>
          </Section>

          <Section title="7. Third-Party Services">
            <p>
              The Site integrates third-party services (including Supabase, Firebase, Stripe, PayPal, Coinbase Commerce, and
              Xaman/XRPL). Your use of those services is subject to their respective terms, and we are not responsible for
              their acts or omissions.
            </p>
          </Section>

          <Section title="8. Acceptable Use">
            <p>You agree not to misuse the Site, interfere with its operation, or use it for unlawful purposes.</p>
          </Section>

          <Section title="9. Intellectual Property">
            <p>
              Site content, marks, scrolls, and materials are owned by or licensed to Blockchain Ministries and may not be
              copied or used without permission, except as allowed by law.
            </p>
          </Section>

          <Section title="10. Disclaimers &amp; Limitation of Liability">
            <p>
              The Site is provided &ldquo;as is&rdquo; without warranties of any kind. To the fullest extent permitted by
              law, Blockchain Ministries shall not be liable for any indirect, incidental, or consequential damages arising
              from your use of the Site or related services.
            </p>
          </Section>

          <Section title="11. Governing Law">
            <p>
              These Terms are governed by the applicable laws of the jurisdiction designated by Blockchain Ministries, to be
              confirmed by counsel. <em>[Placeholder — governing jurisdiction to be finalized on review.]</em>
            </p>
          </Section>

          <Section title="12. Changes to These Terms">
            <p>
              We may update these Terms from time to time. Continued use of the Site after changes take effect constitutes
              acceptance of the revised Terms.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>
              Questions about these Terms may be directed to{' '}
              <a href="mailto:contact@blockchainministries.io" className="text-yellow-300 hover:underline">contact@blockchainministries.io</a>.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
};

export default Terms;
