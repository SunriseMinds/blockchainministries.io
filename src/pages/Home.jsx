
import { Button } from "../components/ui/button.jsx";
import { motion } from "framer-motion";

export default function HomeHero() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0f2c] to-[#0a112e] text-center flex flex-col justify-start items-center px-4 pt-32">
      {/* Header Navigation */}
      <header className="fixed top-0 w-full z-50 bg-[#0a0f2c] text-white shadow-md py-4 px-6 flex justify-between items-center border-b border-[#1c1f3a]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full border-2 border-yellow-400 flex items-center justify-center">
            <span className="text-yellow-400 font-bold text-lg">◯</span>
          </div>
          <h1 className="text-yellow-400 text-xl font-semibold">Blockchain Ministries</h1>
        </div>
        <nav className="flex space-x-6 text-sm">
          {['Home', 'About', 'Ministries', 'Scrolls', 'Token', 'Contact'].map((link) => (
            <a key={link} href={`#${link.toLowerCase()}`} className="hover:text-yellow-400 transition-colors duration-300">
              {link}
            </a>
          ))}
        </nav>
        <div className="flex space-x-3">
          <Button variant="outline" className="text-white border-blue-500 hover:bg-blue-600">
            <span className="mr-1">→</span> Login
          </Button>
          <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">Join Us</Button>
          <Button className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black font-bold shadow-lg hover:opacity-90">Donate</Button>
        </div>
      </header>

      {/* Hero Glyph */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        className="mt-10 mb-6"
      >
        <img src="/logo-glow.svg" alt="Sacred Glyph" className="w-64 h-64 mx-auto drop-shadow-[0_0_25px_rgba(255,215,0,0.6)]" />
      </motion.div>

      {/* Hero Text */}
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1 }}
        className="text-4xl md:text-5xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(255,215,0,0.8)] max-w-4xl"
      >
        Join the Covenant of Light & Truth
      </motion.h2>
    </div>
  );
}
