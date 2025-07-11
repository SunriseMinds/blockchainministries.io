import React from 'react';
import QRCode from 'qrcode.react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const MinisterIDCard = ({ ministerData }) => {
  const getInitials = (name) => {
    if (!name) return 'BM';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
  };

  const verificationUrl = `https://blockchainministries.io/verify?id=${ministerData?.id || 'unknown'}`;

  return (
    <div className="w-[350px] h-[220px] bg-gradient-to-br from-blue-900 via-blue-950 to-black rounded-xl p-4 shadow-2xl shadow-yellow-500/10 border border-yellow-400/30 text-white font-sans flex flex-col justify-between relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-32 h-32 border-4 border-yellow-400/20 rounded-full opacity-30"></div>
      <div className="absolute -bottom-12 -left-12 w-32 h-32 border-4 border-yellow-400/20 rounded-full opacity-30"></div>
      
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs text-yellow-400 font-serif tracking-widest">BLOCKCHAIN MINISTRIES</p>
          <p className="text-sm text-blue-300">MINISTER ID</p>
        </div>
        <svg className="w-8 h-8 text-yellow-400" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z" stroke="currentColor" strokeWidth="3" fill="none" />
        </svg>
      </div>

      <div className="flex items-center gap-4">
        <Avatar className="w-16 h-16 border-2 border-yellow-400/50">
          <AvatarImage src={ministerData?.imageUrl} alt={ministerData?.name} />
          <AvatarFallback className="bg-blue-800 text-yellow-300 text-2xl">
            {getInitials(ministerData?.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-grow">
          <p className="text-lg font-bold text-yellow-200">{ministerData?.name || 'N/A'}</p>
          <p className="text-xs font-mono text-blue-300 break-all">{ministerData?.walletAddress || 'N/A'}</p>
          <p className="text-xs text-blue-300">ID: {ministerData?.id || 'N/A'}</p>
        </div>
        <div className="bg-white p-1 rounded-md">
          <QRCode value={verificationUrl} size={60} bgColor="#ffffff" fgColor="#0A192F" level="L" />
        </div>
      </div>
    </div>
  );
};

export default MinisterIDCard;