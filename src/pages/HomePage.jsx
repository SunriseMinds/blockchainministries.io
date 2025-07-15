import { useState } from "react";
import { motion } from "framer-motion";

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0F2C] to-[#13204A] text-white relative overflow-x-hidden">
      {/* ✅ NAVBAR */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed w-full bg-[#0A0F2C] shadow-md z-50"
      >
        <nav className="flex justify-between items-center px-6 py-4">
          {/* Logo */}
          <motion.div
            className="text-2xl font-bold text-yellow-400"
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Blockchain Ministries
          </motion.div>

          {/* Desktop Menu */}
          <ul className="hidden md:flex gap-6">
            {['Home','About','Ministries','Scrolls','Token','Contact'].map((link, i) => (
              <motion.li
                key={link}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
              >
                <a href={`#${link.toLowerCase()}`} className="hover:text-yellow-400">
                  {link}
                </a>
              </motion.li>
            ))}
            <motion.li
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8 }}
            >
              <a
                href="#donate"
                className="bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400"
              >
                Donate
              </a>
            </motion.li>
          </ul>

          {/* Mobile Toggle Button */}
          <div
            className="md:hidden text-3xl cursor-pointer"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ☰
          </div>
        </nav>

        {/* ✅ Mobile Menu */}
        {menuOpen && (
          <motion.ul
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="md:hidden flex flex-col gap-4 bg-[#111] p-6 absolute top-16 left-0 right-0"
          >
            {['Home','About','Ministries','Scrolls','Token','Contact','Donate'].map((link) => (
              <li key={link}>
                <a href={`#${link.toLowerCase()}`} className="hover:text-yellow-400">
                  {link}
                </a>
              </li>
            ))}
          </motion.ul>
        )}
      </motion.header>

      {/* ✅ HERO SECTION */}
      <section
        id="home"
        className="flex flex-col justify-center items-center text-center min-h-screen pt-32 px-6"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="w-48 h-48 rounded-full flex items-center justify-center border-4 border-yellow-400 mb-6 shadow-lg"
        >
          <motion.span
            animate={{ rotate: [0, 360] }}
            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            className="text-6xl"
          >
            ⛩️
          </motion.span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-4xl md:text-6xl font-bold text-yellow-400 drop-shadow-lg"
        >
          Join the Covenant of Light & Truth
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-4 text-lg max-w-xl"
        >
          A sacred digital sanctuary bridging faith and technology.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-6 flex gap-4"
        >
          <a
            href="#join"
            className="bg-yellow-500 text-black px-6 py-3 rounded-lg shadow hover:bg-yellow-400"
          >
            Join Us
          </a>
          <a
            href="#donate"
            className="border border-yellow-500 px-6 py-3 rounded-lg hover:bg-yellow-500 hover:text-black transition"
          >
            Donate
          </a>
        </motion.div>
      </section>
    </div>
  );
}
