import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  const [form, setForm] = useState({ name: '', wallet: '', email: '' });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: submit form data
    console.log('Form submitted:', form);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section
        id="hero"
        className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex flex-col justify-center items-center text-center py-20 px-4 animate-slide-fade"
      >
        {/* Ripple background */}
        <div className="absolute inset-0 bg-white opacity-20 animate-ping"></div>
        <h1 className="relative text-5xl font-extrabold mb-4">
          Welcome to Blockchain Ministries
        </h1>
        <p className="relative text-xl max-w-3xl mb-8">
          Spiritual Trust. Digital Stewardship. Eternal Record.
        </p>
        <div className="relative space-x-4">
          <Link
            to="/join"
            className="inline-block bg-white text-indigo-700 font-semibold px-6 py-3 rounded-md shadow-md hover:bg-gray-100 transition"
          >
            Join the Covenant
          </Link>
          <Link
            to="/token"
            className="inline-block border border-white text-white font-semibold px-6 py-3 rounded-md hover:bg-white hover:text-indigo-700 transition"
          >
            Mint Minister NFT
          </Link>
        </div>
      </section>

      {/* Who We Are */}
      <section
        id="about"
        className="py-16 px-6 text-center max-w-4xl mx-auto animate-fade-in-up"
      >
        <h2 className="text-3xl font-bold mb-6">Who We Are</h2>
        <p className="text-lg leading-relaxed">
          508(c)(1)(A) Spiritual Trust governed by Ecclesiastical Law.
        </p>
      </section>

      {/* Sacred Scrolls */}
      <section
        id="scrolls"
        className="py-16 px-6 bg-gray-50 text-gray-800 max-w-5xl mx-auto grid md:grid-cols-2 gap-8 animate-zoom-slide"
      >
        <h2 className="text-3xl font-bold mb-4 md:col-span-2">Sacred Scrolls</h2>
        <p className="text-lg leading-relaxed">
          NFT credential registry and spiritual contracts minted on XRPL.
        </p>
      </section>

      {/* Join the Covenant Form */}
      <section
        id="membership"
        className="py-16 px-6 text-center max-w-md mx-auto animate-bounce-fade"
      >
        <h2 className="text-3xl font-bold mb-6">Join the Covenant</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            type="text"
            placeholder="Full Name"
            value={form.name}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            name="wallet"
            type="text"
            placeholder="Wallet Address"
            value={form.wallet}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="bg-indigo-700 text-white px-6 py-2 rounded-md font-semibold hover:bg-indigo-800 transition"
          >
            Submit
          </button>
        </form>
      </section>

      {/* Footer */}
      <footer
        id="footer"
        className="mt-auto bg-gray-900 text-gray-400 py-8"
      >
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
          <div className="flex space-x-4 mb-4 md:mb-0">
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/donate" className="hover:text-white">Donate</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
          </div>
          <div className="flex space-x-4">
            <a href="https://twitter.com/yourprofile" target="_blank" rel="noopener noreferrer">X</a>
            <a href="https://instagram.com/yourprofile" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="https://youtube.com/yourchannel" target="_blank" rel="noopener noreferrer">YouTube</a>
          </div>
        </div>
        <p className="text-center text-sm mt-4">
          &copy; {new Date().getFullYear()} Blockchain Ministries. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
