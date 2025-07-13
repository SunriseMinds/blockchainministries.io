import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-blue-950/50 text-blue-300 p-8 text-center border-t border-yellow-400/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="text-center md:text-left">
          <p className="font-bold text-lg text-yellow-300 sacred-font">Blockchain Ministries</p>
          <p className="text-sm mt-2">&copy; {new Date().getFullYear()} A Sovereign Ecclesiastical Trust. All Rights Reserved.</p>
        </div>
        <div>
          <p className="font-bold text-lg text-yellow-300 sacred-font mb-4">Navigate</p>
          <nav className="flex flex-col space-y-2">
            <Link to="/about" className="hover:text-yellow-300 transition-colors">About Us</Link>
            <Link to="/ministries" className="hover:text-yellow-300 transition-colors">Ministries</Link>
            <Link to="/scrolls" className="hover:text-yellow-300 transition-colors">Scrolls</Link>
            <Link to="/recognition" className="hover:text-yellow-300 transition-colors">Recognition</Link>
          </nav>
        </div>
        <div>
          <p className="font-bold text-lg text-yellow-300 sacred-font mb-4">Get Involved</p>
          <nav className="flex flex-col space-y-2">
            <Link to="/join" className="hover:text-yellow-300 transition-colors">Join Us</Link>
            <Link to="/donate" className="hover:text-yellow-300 transition-colors">Donate</Link>
            <Link to="/token" className="hover:text-yellow-300 transition-colors">EFT Token</Link>
            <Link to="/contact" className="hover:text-yellow-300 transition-colors">Contact</Link>
          </nav>
        </div>
      </div>
      <div className="mt-8 border-t border-yellow-400/10 pt-6">
        <p className="text-sm text-blue-400">contact@blockchainministries.io | Contact us for official correspondence.</p>
      </div>
    </footer>
  );
};
export default Footer;
