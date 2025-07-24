import { QRCodeCanvas } from "qrcode.react";

export default function QRCodeSection() {
  return (
    <section className="py-12 text-center bg-black/40 backdrop-blur-md">
      <h2 className="text-3xl font-bold text-yellow-400 mb-4">
        Scan or Click to Visit Blockchain Ministries
      </h2>
      <p className="text-gray-300 mb-6">
        Our digital sanctuary is just one tap away.
      </p>

      {/* ✅ Clickable QR Code */}
      <a
        href="https://blockchainministries.io"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block p-4 bg-white rounded-xl shadow-lg hover:scale-105 transition-transform"
      >
        <QRCodeCanvas
          value="https://blockchainministries.io"
          size={200}
          bgColor="#FFFFFF"
          fgColor="#000000"
          level="H"
          includeMargin={true}
        />
      </a>
      <div className="mt-6">
        <a
          href="https://blockchainministries.io"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-yellow-500 px-6 py-3 rounded text-black font-bold"
        >
          Go to Site
        </a>
      </div>
    </section>
  );
}
