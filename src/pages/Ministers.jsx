import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Users } from 'lucide-react';

const MinisterCard = ({ minister, index }) => {
  const getInitials = (name) => {
    if (!name) return 'BM';
    const names = name.trim().split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Link to={`/minister/${minister.id}`}>
        <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg hover:shadow-yellow-400/20 hover:border-yellow-400/50 transition-all duration-300 h-full flex flex-col cursor-pointer">
          <CardHeader className="flex-row items-center gap-4 p-4">
            <Avatar className="w-16 h-16 border-2 border-yellow-400/50">
              <AvatarImage src={minister.imageUrl} alt={minister.name || 'Minister avatar'} />
              <AvatarFallback className="bg-blue-800 text-yellow-300 text-2xl">
                {getInitials(minister.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl font-serif text-yellow-400">{minister.name || 'Unnamed Minister'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-grow p-4 pt-0">
            <p className="text-yellow-200/70 italic">
              {minister.title || "Servant of the Covenant"}
            </p>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
};

const Ministers = () => {
  const [ministers, setMinisters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMinisters = async () => {
      try {
        const { data, error } = await supabase.from('ministers').select('*');
        if (error) throw error;
        setMinisters(data);
      } catch (err) {
        console.error("Error fetching ministers:", err);
        setError('Failed to load ministers. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchMinisters();
  }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900 via-blue-950 to-black text-yellow-400 text-center p-8 min-h-[calc(100vh-200px)] flex items-center justify-center text-2xl font-serif">
        Loading the Ministers' Circle...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-red-900 via-red-950 to-black text-red-400 text-center p-8 min-h-[calc(100vh-200px)] flex items-center justify-center text-2xl font-serif">
        {error}
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Ministers Circle | Blockchain Ministries</title>
        <meta name="description" content="Meet the ordained ministers of Blockchain Ministries, dedicated to spiritual governance and digital truth." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-12"
      >
        <div className="text-center mb-12">
          <Users className="mx-auto h-16 w-16 text-yellow-400 mb-4" />
          <h1 className="text-5xl font-serif font-bold text-yellow-400 tracking-wider">The Ministers' Circle</h1>
          <p className="mt-4 text-xl text-yellow-200/80 max-w-3xl mx-auto">
            A fellowship of sovereign individuals ordained under the covenant, serving the mission of light and truth on the eternal ledger.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {ministers.map((minister, index) => (
            <MinisterCard key={minister.id} minister={minister} index={index} />
          ))}
        </div>
      </motion.div>
    </>
  );
};

export default Ministers;
