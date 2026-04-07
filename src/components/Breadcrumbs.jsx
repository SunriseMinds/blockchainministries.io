import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const Breadcrumbs = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  if (pathnames.length === 0) {
    return null;
  }

  const capitalize = (s) => {
    if (s === 'minister') return 'Ministers';
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
  }

  return (
    <nav aria-label="breadcrumb" className="container mx-auto px-4 pt-4 -mb-4">
      <ol className="flex items-center space-x-2 text-sm text-blue-300">
        <li>
          <Link to="/" className="flex items-center gap-2 hover:text-yellow-300 transition-colors">
            <Home className="h-4 w-4" />
            Home
          </Link>
        </li>
        {pathnames.map((value, index) => {
          const last = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join('/')}`;
          
          if (pathnames[index-1] === 'minister' && !isNaN(value)) {
            return null;
          }

          return (
            <li key={to} className="flex items-center space-x-2">
              <ChevronRight className="h-4 w-4 text-yellow-400/50" />
              {last ? (
                <span className="font-semibold text-white">{capitalize(value)}</span>
              ) : (
                <Link to={to} className="hover:text-yellow-300 transition-colors">
                  {capitalize(value)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;