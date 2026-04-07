import React from 'react';
import { Navigate } from 'react-router-dom';

const Membership = () => {
  // This page is deprecated and now redirects to the new /join page.
  return <Navigate to="/join" replace />;
};

export default Membership;