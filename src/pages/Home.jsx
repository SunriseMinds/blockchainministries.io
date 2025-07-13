
import React from 'react';
import { Button } from '../components/ui/button.jsx';
import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <div className="min-h-screen text-white bg-gradient-to-br from-[#0A0F2C] to-[#162A64] relative overflow-hidden">
      {/* Logo and Nav */}
      <header className="flex justify-between items-center px-8 py-6 border-b border-white/10 bg-[#0A0F2C]/80 backdrop-blur-md z-10 relative">
        <div className="flex items-center space-x-3">
          <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
          <span className="font-bold text-lg text-yellow-400">Blockchain Ministries</span>
        </div>
        <nav className="flex items-center space-x-6 text-sm">
          <a href="#home" className="hover:text-yellow-300">Home</a>
          <a href="#about" className="hover:text-yellow-300">About</a>
          <a href="#ministries" className="hover:text-yellow-300">Ministries</a>
          <a href="#scrolls" className="hover:text-yellow-300">Scrolls</a>
          <a href="#token" className="hover:text-yellow-300">Token</a>
          <a href="#contact" className="hover:text-yellow-300">Contact</a>
          <Button variant="outline" className="border-yellow-400 text-yellow-300 hover:bg-yellow-400 hover:text-black">Login</Button>
          <Button variant="ghost" className="text-yellow-300 hover:underline">Join Us</Button>
          <Button variant="default" className="bg-yellow-400 text-black hover:bg-yellow-300">Donate</Button>
        </nav>
      </header>

      {/* Background Symbol (centered) */}
      <div className="absolute inset-0 flex justify-center items-center opacity-20 z-0">
        <img src="/symbol.svg" alt="Sacred Symbol" className="w-[60%]" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center mt-20 text-center px-4">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-5xl font-extrabold text-yellow-400 drop-shadow-lg mb-4"
        >
          Join the Covenant of Light & Truth
        </motion.h1>
        <p className="max-w-2xl text-lg text-gray-200">
          Embrace divine stewardship through decentralized trust and spiritual sovereignty.
        </p>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 mt-24 text-sm text-gray-400 border-t border-white/10">
        © 2025 Blockchain Ministries. A Sovereign Ecclesiastical Trust. All Rights Reserved.
      </footer>
    </div>
  );
}
