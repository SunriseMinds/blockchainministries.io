import { useState } from "react";

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0F2C] to-[#13204A] text-white relative">
      {/* ✅ NAVBAR */}
      <header className="fixed w-full bg-[#0A0F2C] shadow-md z-50">
        <nav className="flex justify-between items-center px-6 py-4">
          {/* Logo */}
          <div className="text-2xl font-bold text-yellow-400">
            Blockchain Ministries
          </div>

          {/* Desktop Menu */}
          <ul className="hidden md:flex gap-6">
            <li><a href="#home" className="hover:text-yellow-400">Home</a></li>
            <li><a href="#about" className="hover:text-yellow-400">About</a></li>
            <li><a href="#ministries" className="hover:text-yellow-400">Ministries</a></li>
            <li><a href="#scrolls" className="hover:text-yellow-400">Scrolls</a></li>
            <li><a href="#token" className="hover:text-yellow-400">Token</a></li>
            <li><a href="#contact" className="hover:text-yellow-400">Contact</a></li>
            <li>
              <a
                href="#donate"
                className="bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400"
              >
                Donate
              </a>
            </li>
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
          <ul className="md:hidden flex flex-col gap-4 bg-[#111] p-6 absolute top-16 left-0 right-0">
            <li><a href="#home" className="hover:text-yellow-400">Home</a></li>
            <li><a href="#about" className="hover:text-yellow-400">About</a></li>
            <li><a href="#ministries" className="hover:text-yellow-400">Ministries</a></li>
            <li><a href="#scrolls" className="hover:text-yellow-400">Scrolls</a></li>
            <li><a href="#token" className="hover:text-yellow-400">Token</a></li>
            <li><a href="#contact" className="hover:text-yellow-400">Contact</a></li>
            <li>
              <a
                href="#donate"
                className="bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400"
              >
                Donate
              </a>
            </li>
          </ul>
        )}
      </header>

      {/* ✅ HERO SECTION */}
      <section
        id="home"
        className="flex flex-col justify-center items-center text-center min-h-screen pt-32 px-6"
      >
        {/* Logo/Graphic */}
        <div className="w-48 h-48 rounded-full flex items-center justify-center border-4 border-yellow-400 mb-6">
          <span className="text-6xl">⛩️</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-6xl font-bold text-yellow-400 drop-shadow-lg">
          Join the Covenant of Light & Truth
        </h1>

        {/* Subtitle */}
        <p className="mt-4 text-lg max-w-xl">
          A sacred digital sanctuary bridging faith and technology.
        </p>

        {/* CTA Buttons */}
        <div className="mt-6 flex gap-4">
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
        </div>
      </section>
    </div>
  );
}
