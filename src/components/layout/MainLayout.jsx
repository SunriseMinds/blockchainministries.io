import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Breadcrumbs from '@/components/Breadcrumbs';
import { Toaster } from "@/components/ui/toaster";

const MainLayout = () => {
  const location = useLocation();
  const showBreadcrumbs = location.pathname !== '/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-[#0A192F] to-black font-sans">
      {/* M12: keyboard users can jump past the header nav. Visually hidden
          until focused, so it costs the visual design nothing. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-yellow-400 focus:px-4 focus:py-2 focus:font-semibold focus:text-blue-950"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content">
        {showBreadcrumbs && <Breadcrumbs />}
        <div className="container mx-auto px-4 py-8">
          <Outlet />
        </div>
      </main>
      <Footer />
      <Toaster />
    </div>
  );
};

export default MainLayout;