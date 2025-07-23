import { QRCodeCanvas } from "qrcode.react";

export default function QRCodeSection() {
  return (
    <section className="py-12 text-center bg-black/40 backdrop-blur-md">
      <h2 className="text-3xl font-bold text-yellow-400 mb-4">
        Scan to Visit Blockchain Ministries
      </h2>
      <p className="text-gray-300 mb-6">
        Quickly access our digital sanctuary by scanning the code below.
      </p>
      
      <div className="inline-block p-4 bg-white rounded-xl shadow-lg">
        <QRCodeCanvas
          value="https://blockchainministries.io"
          size={200}
          bgColor="#FFFFFF"
          fgColor="#000000"
          level="H"
          includeMargin={true}
        />
      </div>
    </section>
  );
}
