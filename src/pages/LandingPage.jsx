import React from 'react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex flex-col justify-center items-center text-center py-20 px-4">
        <h1 className="text-5xl font-extrabold mb-4">Welcome to Blockchain Ministries</h1>
        <p className="text-xl max-w-3xl mb-8">
          Empowering spiritual communities through blockchain technology.
        </p>
        <div className="space-x-4">
          <a
            href="/join"
            className="inline-block bg-white text-indigo-700 font-semibold px-6 py-3 rounded-md shadow-md hover:bg-gray-100 transition"
          >
            Join Us
          </a>
          <a
            href="/about"
            className="inline-block border border-white text-white font-semibold px-6 py-3 rounded-md hover:bg-white hover:text-indigo-700 transition"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="flex-grow bg-white text-gray-800 py-16 px-6 text-center max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
        <p className="text-lg leading-relaxed">
          At Blockchain Ministries, our mission is to harness the power of blockchain to create transparent,
          secure, and inclusive platforms for spiritual growth and community engagement. We believe in
          fostering trust and collaboration through innovative technology that respects faith and tradition.
        </p>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-6 text-center">
        <p>&copy; {new Date().getFullYear()} Blockchain Ministries. All rights reserved.</p>
      </footer>
    </div>
  );
}
