import React from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AdminRoute from '../../components/auth/AdminRoute.jsx';

const AdminDashboardContent = () => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Welcome, Admin!</h1>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Analytics</h2>
        <div className="border border-dashed border-gray-400 rounded-lg p-6 text-center text-gray-500">
          Analytics placeholder
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-4">User Management</h2>
        <div className="border border-dashed border-gray-400 rounded-lg p-6 text-center text-gray-500">
          User management placeholder
        </div>
      </section>
    </div>
  );
};

const AdminDashboard = () => {
  return (
    <AdminRoute>
      <DashboardLayout>
        <AdminDashboardContent />
      </DashboardLayout>
    </AdminRoute>
  );
};

export default AdminDashboard;
