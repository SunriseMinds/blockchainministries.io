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
      <Header />
      <main>
        {showBreadcrumbs && <Breadcrumbs />}
        <div className="container py-8">
          <Outlet />
        </div>
      </main>
      <Footer />
      <Toaster />
    </div>
  );
};

export default MainLayout;
