import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { Calendar } from 'lucide-react';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/documents': 'Documents',
  '/alerts': 'Alerts & Reminders',
  '/reports': 'Reports & Export',
  '/approvals': 'Renewal Approvals Queue',
  '/audit-logs': 'Immutable Audit Trail',
  '/profile': 'My Profile',
};

const Layout = () => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'RenewalTrack';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <header className="topbar">
          <h1 className="topbar-title">{title}</h1>
          <div className="topbar-right">
            <div className="topbar-date-badge">
              <Calendar size={13} />
              <span>
                {new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
