import React from 'react';
import QRCode from 'qrcode.react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

const CryptoQRCode = ({ assetName, address }) => {
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address);
    toast({
      title: 'Copied to Clipboard!',
      description: `${assetName} address has been copied.`,
      className: 'bg-blue-950/80 border-yellow-400 text-white backdrop-blur-md',
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-blue-950/50 rounded-lg border border-yellow-400/20">
      <h3 className="text-xl font-bold text-yellow-300 sacred-font">{assetName}</h3>
      <div className="p-2 bg-white rounded-lg">
        <QRCode value={address} size={160} />
      </div>
      <div className="w-full p-3 bg-slate-800 rounded-lg text-center">
        <code className="text-sm text-white break-all">{address}</code>
      </div>
      <Button onClick={copyToClipboard} variant="outline" className="w-full border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/10">
        <Copy className="mr-2 h-4 w-4" />
        Copy Address
      </Button>
    </div>
  );
};

export default CryptoQRCode;