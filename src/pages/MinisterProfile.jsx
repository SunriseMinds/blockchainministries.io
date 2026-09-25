import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { api } from '@/lib/cloudflareApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { BookOpen } from 'lucide-react';
import PagePlaceholder from '@/components/PagePlaceholder';
import { getInitials, mapMinister } from './ministersData';

const MinisterProfile = () => {
  const { ministerId } = useParams();
  const [minister, setMinister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchMinister = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/ministers/${encodeURIComponent(ministerId)}`);
        if (!cancelled) setMinister(mapMinister(res));
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setError('Minister not found in the sacred archives.');
        } else {
          console.error('Error fetching minister:', err);
          setError('An error occurred while seeking the minister.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMinister();
    return () => { cancelled = true; };
  }, [ministerId]);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-black text-yellow-400 text-center p-8 min-h-[calc(100vh-200px)] flex items-center justify-center text-2xl font-serif">
        Seeking Minister's Record...
      </div>
    );
  }

  if (error) {
    return <PagePlaceholder title="Archive Search Error" description={error} />;
  }

  if (!minister) {
    return <PagePlaceholder title="Archive Search Error" description="Minister not found in the sacred archives." />;
  }

  return (
    <>
      <Helmet>
        <title>{minister.name ? `${minister.name} - Minister` : 'Minister Profile'} | Blockchain Ministries</title>
        <meta name="description" content={`Profile of Minister ${minister.name || 'of the Covenant'}, serving in Blockchain Ministries.`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="container mx-auto px-4 py-12"
      >
        <Card className="max-w-4xl mx-auto bg-blue-950/30 border-yellow-400/20 text-white shadow-2xl shadow-blue-500/10 backdrop-blur-md">
          <CardHeader className="text-center p-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
              <Avatar className="w-32 h-32 mx-auto mb-4 border-4 border-yellow-400/50">
                <AvatarImage src={minister.imageUrl} alt={minister.name} />
                <AvatarFallback className="bg-blue-800 text-yellow-300 text-4xl font-bold">
                  {getInitials(minister.name)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            <CardTitle className="text-4xl font-serif text-yellow-400 tracking-wider">{minister.name || "Unnamed Minister"}</CardTitle>
            <CardDescription className="text-yellow-200/80 text-lg mt-2">{minister.title || "Servant of the Covenant"}</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            <div className="border-t border-yellow-400/20 my-6"></div>
            <div className="space-y-8">
              <div>
                <h3 className="text-2xl font-semibold text-yellow-300 mb-3 flex items-center">
                  <BookOpen className="w-6 h-6 mr-3 text-yellow-400" />
                  Sacred Bio
                </h3>
                <p className="text-lg text-gray-300 leading-relaxed italic">
                  {minister.bio || "No biography provided."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default MinisterProfile;
