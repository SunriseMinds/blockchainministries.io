import React from 'react';
import QRCode from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Link as LinkIcon, QrCode } from 'lucide-react';

const TrustlineQRCode = ({ trustlineUrl, buttonText, title, description }) => {
  return (
    <Card className="flex flex-col items-center gap-4 p-6 bg-blue-950/50 rounded-lg border border-yellow-400/20 text-center">
      <QrCode className="w-12 h-12 text-yellow-300" />
      <CardHeader className="p-0">
        <CardTitle className="text-xl font-bold text-yellow-300 sacred-font">{title}</CardTitle>
        {description && <CardDescription className="text-blue-300 mt-2">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0 flex flex-col items-center gap-4 w-full">
        <div className="p-2 bg-white rounded-lg mt-2">
          <QRCode value={trustlineUrl} size={160} bgColor="#ffffff" fgColor="#000000" />
        </div>
        <p className="text-xs text-blue-400">Scan with a mobile wallet like XUMM.</p>
        <Button asChild className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-blue-950 font-bold">
          <a href={trustlineUrl} target="_blank" rel="noopener noreferrer">
            <LinkIcon className="mr-2 h-4 w-4" />
            {buttonText}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

export default TrustlineQRCode;