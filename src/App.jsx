import React from 'react';
import XUMMConnect from './components/XUMMConnect';

function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100">
      <div>
        <h1 className="text-3xl font-bold text-purple-900">🌐 Blockchain Ministries</h1>
        <p className="mt-2 text-lg text-gray-700">
          Welcome to the Omnipresent Web3 Sanctuary
        </p>

        {/* Wallet Connect Button */}
        <div className="mt-6">
          <XUMMConnect />
        </div>
      </div>
    </div>
  );
}

export default App;
