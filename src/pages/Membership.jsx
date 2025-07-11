import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Shield, Crown, Users, FileText, Upload, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const Membership = () => {
  const { toast } = useToast();

  const handleAction = (action) => {
    toast({
      title: "🚧 Feature Coming Soon",
      description: "This sacred functionality isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      duration: 4000,
    });
  };

  return (
    <>
      <Helmet>
        <title>Join Us - Blockchain Ministries Membership</title>
        <meta name="description" content="Join Blockchain Ministries through our covenant membership, minister application, or diplomatic emissary program. Access exclusive member benefits." />
      </Helmet>

      <div className="pt-20">
        {/* Hero Section */}
        <section className="py-20 px-4 relative overflow-hidden">
          <div className="absolute inset-0 geometric-pattern opacity-20"></div>
          <div className="max-w-6xl mx-auto relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-16"
            >
              <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center sacred-pulse">
                <Users className="w-12 h-12 text-slate-900" />
              </div>
              <h1 className="sacred-font text-5xl md:text-6xl font-bold mb-6 gradient-text">
                Join Our Sacred Community
              </h1>
              <p className="text-xl text-gray-300 max-w-4xl mx-auto">
                Become part of our divine mission through covenant membership and sacred fellowship
              </p>
            </motion.div>
          </div>
        </section>

        {/* Membership Options */}
        <section className="py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {[
                {
                  icon: Shield,
                  title: "Covenant Member",
                  subtitle: "Sacred Fellowship",
                  description: "Join our private member association with full access to sacred resources and community support.",
                  features: [
                    "PMA Agreement Protection",
                    "Sacred Resource Access",
                    "Community Fellowship",
                    "Spiritual Guidance"
                  ],
                  color: "from-blue-400 to-blue-600",
                  action: "covenant"
                },
                {
                  icon: Crown,
                  title: "Ordained Minister",
                  subtitle: "Divine Authority",
                  description: "Receive full ministerial ordination with ecclesiastical authority and sovereign protection.",
                  features: [
                    "Full Ordination Rights",
                    "Ministerial Authority",
                    "Legal Protection",
                    "Blockchain Credentials"
                  ],
                  color: "from-yellow-400 to-yellow-600",
                  action: "minister"
                },
                {
                  icon: Key,
                  title: "Diplomatic Emissary",
                  subtitle: "Global Ambassador",
                  description: "Serve as our diplomatic representative with special privileges and international recognition.",
                  features: [
                    "Diplomatic Status",
                    "International Recognition",
                    "Embassy Access",
                    "Special Privileges"
                  ],
                  color: "from-purple-400 to-purple-600",
                  action: "diplomat"
                }
              ].map((option, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: index * 0.2 }}
                  className="celestial-bg rounded-2xl p-8 text-center hover:scale-105 transition-all duration-300"
                >
                  <div className={`w-16 h-16 mx-auto mb-6 bg-gradient-to-br ${option.color} rounded-full flex items-center justify-center`}>
                    <option.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="sacred-font text-2xl font-bold mb-2 gradient-text">
                    {option.title}
                  </h3>
                  <p className="text-yellow-400 font-medium mb-4">
                    {option.subtitle}
                  </p>
                  <p className="text-gray-300 mb-6 leading-relaxed">
                    {option.description}
                  </p>
                  <div className="space-y-2 mb-8">
                    {option.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-center justify-center">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                        <span className="text-gray-300 text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => handleAction(option.action)}
                    className={`bg-gradient-to-r ${option.color} hover:opacity-90 text-white font-bold px-6 py-3 rounded-xl shadow-lg transform hover:scale-105 transition-all duration-300 w-full`}
                  >
                    Apply Now
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* PMA Agreement Section */}
        <section className="py-16 px-4 bg-gradient-to-r from-slate-900/50 to-slate-800/50">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="celestial-bg rounded-2xl p-8 md:p-12"
            >
              <div className="text-center mb-12">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                  <FileText className="w-10 h-10 text-slate-900" />
                </div>
                <h2 className="sacred-font text-4xl font-bold mb-4 gradient-text">
                  Private Member Association
                </h2>
                <p className="text-xl text-gray-300 mb-8">
                  Understanding Your Covenant Membership Benefits
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="sacred-font text-2xl font-bold text-yellow-400 mb-6">
                    PMA Protection Benefits
                  </h3>
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start">
                      <Shield className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Constitutional protection under freedom of association</span>
                    </li>
                    <li className="flex items-start">
                      <Shield className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Privacy protection for member activities and communications</span>
                    </li>
                    <li className="flex items-start">
                      <Shield className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Ecclesiastical sovereignty and religious freedom</span>
                    </li>
                    <li className="flex items-start">
                      <Shield className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Legal standing as private association member</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="sacred-font text-2xl font-bold text-yellow-400 mb-6">
                    Member Privileges
                  </h3>
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start">
                      <Crown className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Access to sacred scrolls and divine teachings</span>
                    </li>
                    <li className="flex items-start">
                      <Crown className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Participation in ministry programs and services</span>
                    </li>
                    <li className="flex items-start">
                      <Crown className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Community fellowship and spiritual support</span>
                    </li>
                    <li className="flex items-start">
                      <Crown className="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0" />
                      <span>Priority access to ordination and credentials</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="text-center mt-12">
                <Button
                  onClick={() => handleAction('pma')}
                  className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-slate-900 font-bold px-8 py-4 text-lg rounded-xl shadow-2xl transform hover:scale-105 transition-all duration-300"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Sign Covenant Agreement
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Verification Process */}
        <section className="py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-12"
            >
              <h2 className="sacred-font text-4xl md:text-5xl font-bold mb-6 gradient-text">
                Verification & Access
              </h2>
              <p className="text-xl text-gray-300">
                Secure your membership with blockchain verification
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="celestial-bg rounded-2xl p-8"
              >
                <div className="flex items-center mb-6">
                  <Upload className="w-8 h-8 text-yellow-400 mr-4" />
                  <h3 className="sacred-font text-2xl font-bold text-yellow-400">
                    Identity Verification
                  </h3>
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Upload your identification documents for secure verification and 
                  receive your blockchain-verified membership badge.
                </p>
                <ul className="space-y-3 text-gray-300 mb-6">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                    Secure document upload
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                    Blockchain verification
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                    Digital badge issuance
                  </li>
                </ul>
                <Button
                  onClick={() => handleAction('upload')}
                  variant="outline"
                  className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/20 w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Documents
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="celestial-bg rounded-2xl p-8"
              >
                <div className="flex items-center mb-6">
                  <Key className="w-8 h-8 text-yellow-400 mr-4" />
                  <h3 className="sacred-font text-2xl font-bold text-yellow-400">
                    Member Dashboard
                  </h3>
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Access your private member dashboard with exclusive resources, 
                  community features, and ministry tools.
                </p>
                <ul className="space-y-3 text-gray-300 mb-6">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                    Private member area
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                    Exclusive resources
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                    Community features
                  </li>
                </ul>
                <Button
                  onClick={() => handleAction('dashboard')}
                  variant="outline"
                  className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/20 w-full"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Access Dashboard
                </Button>
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default Membership;