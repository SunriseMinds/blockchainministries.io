import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, XCircle, FileText, User, Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CovenantPanel = ({ ministerData }) => {
  const { toast } = useToast();

  const handleNotImplemented = () => {
    toast({
      title: "Feature Inscription Pending",
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      variant: "destructive",
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Verified':
        return <CheckCircle className="text-green-400" />;
      case 'Pending':
        return <AlertTriangle className="text-yellow-400" />;
      default:
        return <XCircle className="text-red-500" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-blue-950/30 border-yellow-400/20 text-white shadow-lg w-full">
        <CardHeader>
          <CardTitle className="text-yellow-400 text-2xl flex items-center">
            <FileText className="mr-3" />
            Covenant Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-lg">
            <span className="text-blue-300 flex items-center"><User className="w-4 h-4 mr-2"/>Name / Minister ID</span>
            <span className="font-bold text-yellow-200">{ministerData?.name || 'N/A'} / {ministerData?.id.slice(0, 8) || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-lg">
            <span className="text-blue-300">Covenant Tier</span>
            <span className="font-bold text-yellow-200">{ministerData?.tier || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-lg">
            <span className="text-blue-300 flex items-center"><Calendar className="w-4 h-4 mr-2"/>Join Date</span>
            <span className="font-bold text-yellow-200">
              {ministerData?.joinDate ? new Date(ministerData.joinDate.seconds * 1000).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-lg">
            <span className="text-blue-300">Status</span>
            <div className="flex items-center gap-2 font-bold text-yellow-200">
              {getStatusIcon(ministerData?.status || 'Inactive')}
              <span>{ministerData?.status || 'Inactive'}</span>
            </div>
          </div>
          <div className="pt-4">
            <Button className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 text-blue-950 font-bold" onClick={handleNotImplemented}>
              View Covenant Document
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default CovenantPanel;