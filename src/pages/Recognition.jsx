import React from 'react';
import { Helmet } from 'react-helmet';
import { useToast } from '@/components/ui/use-toast';
import RecognitionHero from '@/pages/Recognition/components/RecognitionHero';
import GlobalMapSection from '@/pages/Recognition/components/GlobalMapSection';
import DiplomaticTimeline from '@/pages/Recognition/components/DiplomaticTimeline';
import EmbassyCredentials from '@/pages/Recognition/components/EmbassyCredentials';
import GlobalImpactStats from '@/pages/Recognition/components/GlobalImpactStats';
import { Building, Users, Globe, MapPin } from 'lucide-react';

const Recognition = () => {
  const { toast } = useToast();

  const handleAction = (action) => {
    toast({
      title: "🚧 Feature Coming Soon",
      description: `The ${action} feature isn't implemented yet—but you can request it in your next prompt! 🚀`,
      duration: 4000,
      className: 'bg-blue-900 border-yellow-400 text-white',
    });
  };

  const globalOffices = [
    { country: "Ghana", city: "Accra", type: "Primary Office", status: "Active", established: "2024", ministers: 12 },
    { country: "United States", city: "Various States", type: "Sovereign Seat", status: "Active", established: "2024", ministers: 45 },
    { country: "Canada", city: "Toronto", type: "Satellite Temple", status: "Establishing", established: "2024", ministers: 8 },
    { country: "United Kingdom", city: "London", type: "Satellite Temple", status: "Establishing", established: "2024", ministers: 15 }
  ];

  const diplomaticEvents = [
    { date: "2024-01-15", event: "Trust Declaration Filed", location: "United States", type: "Legal Recognition" },
    { date: "2024-02-01", event: "Ghana Office Established", location: "Accra, Ghana", type: "International Expansion" },
    { date: "2024-02-15", event: "First Ministerial Ordinations", location: "Multiple Locations", type: "Ecclesiastical Authority" },
    { date: "2024-03-01", event: "Diplomatic Relations Initiated", location: "International", type: "Diplomatic Recognition" },
    { date: "2024-03-15", event: "Blockchain Verification System Launched", location: "Global", type: "Technology Integration" },
    { date: "2024-04-01", event: "Sacred Scrolls Archive Established", location: "Digital Realm", type: "Knowledge Preservation" }
  ];

  const impactStats = [
    { icon: Building, number: "4", label: "Global Offices", description: "Active ministry locations" },
    { icon: Users, number: "80+", label: "Ordained Ministers", description: "Certified ecclesiastical authority" },
    { icon: Globe, number: "12", label: "Countries", description: "International recognition" },
    { icon: MapPin, number: "25+", label: "Sacred Sites", description: "Protected and restored locations" }
  ];

  return (
    <>
      <Helmet>
        <title>Global Recognition - Blockchain Ministries</title>
        <meta name="description" content="Explore our global presence with offices in Ghana and the US, diplomatic relations, and international recognition of our ecclesiastical authority." />
      </Helmet>

      <div className="pt-20">
        <RecognitionHero />
        <GlobalMapSection offices={globalOffices} />
        <DiplomaticTimeline events={diplomaticEvents} />
        <EmbassyCredentials onDownload={() => handleAction('Embassy Package')} />
        <GlobalImpactStats stats={impactStats} />
      </div>
    </>
  );
};

export default Recognition;