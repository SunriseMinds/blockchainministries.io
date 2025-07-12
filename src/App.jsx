import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import PagePlaceholder from '@/components/PagePlaceholder';
import ProtectedRoute from '@/components/dashboard/ProtectedRoute';
import AdminRoute from '@/components/auth/AdminRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';

const Home = lazy(() => import('@/pages/Home'));
const About = lazy(() => import('@/pages/About'));
const Ordination = lazy(() => import('@/pages/Ordination'));
const Ministries = lazy(() => import('@/pages/Ministries'));
const Join = lazy(() => import('@/pages/Join'));
const Scrolls = lazy(() => import('@/pages/Scrolls'));
const Donate = lazy(() => import('@/pages/Donate'));
const Recognition = lazy(() => import('@/pages/Recognition'));
const Contact = lazy(() => import('@/pages/Contact'));
const Partnerships = lazy(() => import('@/pages/Partnerships'));
const Ministers = lazy(() => import('@/pages/Ministers'));
const MinisterProfile = lazy(() => import('@/pages/MinisterProfile'));
const Token = lazy(() => import('@/pages/Token'));

// Auth Pages
const Login = lazy(() => import('@/pages/auth/Login'));
const SignUp = lazy(() => import('@/pages/auth/SignUp'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const UpdatePassword = lazy(() => import('@/pages/auth/UpdatePassword'));

// Dashboard Pages
const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminManagement = lazy(() => import('@/pages/admin/AdminManagement'));
const UserProfile = lazy(() => import('@/pages/UserProfile'));

function App() {
  return (
    <Suspense fallback={<div className="bg-gradient-to-br from-blue-900 via-blue-950 to-black text-yellow-400 text-center p-8 min-h-screen flex items-center justify-center text-2xl font-serif">Loading Sacred Geometry...</div>}>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="ordination" element={<Ordination />} />
          <Route path="ministries" element={<Ministries />} />
          <Route path="join" element={<Join />} />
          <Route path="scrolls" element={<Scrolls />} />
          <Route path="token" element={<Token />} />
          <Route path="donate" element={<Donate />} />
          <Route path="recognition" element={<Recognition />} />
          <Route path="partnerships" element={<Partnerships />} />
          <Route path="contact" element={<Contact />} />
          <Route path="ministers" element={<Ministers />} />
          <Route path="minister/:ministerId" element={<MinisterProfile />} />
          
          {/* Auth Routes */}
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<SignUp />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="update-password" element={<UpdatePassword />} />

          <Route path="*" element={<PagePlaceholder title="404 - Scroll Not Found" description="The page you are looking for does not exist in our archives." />} />
        </Route>
        
        {/* Member Dashboard */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<DashboardHome />} />
        </Route>

        {/* User Profile */}
        <Route path="/profile" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<UserProfile />} />
        </Route>

        {/* Admin Dashboard */}
        <Route path="/admin" element={<AdminRoute><DashboardLayout /></AdminRoute>}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="management" element={<AdminManagement />} />
        </Route>

      </Routes>
    </Suspense>
  );
}

export default App;
