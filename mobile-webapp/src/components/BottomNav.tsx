/**
 * Bottom Navigation Component
 * 
 * Mobile-optimized bottom navigation bar
 */

import { useApp } from '../store/AppContext';

interface NavItem {
  id: 'dashboard' | 'branches' | 'pull-requests' | 'computers' | 'jira' | 'settings';
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'branches', icon: 'fork_right', label: 'Branches' },
  { id: 'pull-requests', icon: 'merge_type', label: 'Pull Requests' },
  { id: 'computers', icon: 'computer', label: 'Computers' },
  { id: 'jira', icon: 'assignment', label: 'Jira' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export default function BottomNav() {
  const { state, dispatch } = useApp();

  const handleNavClick = (view: NavItem['id']) => {
    dispatch({ type: 'SET_VIEW', payload: view });
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-sidebar-dark border-t border-slate-200 dark:border-border-dark z-30 safe-bottom shadow-lg">
      <div className="flex items-center justify-around h-full max-w-lg mx-auto">
        {navItems.map(item => {
          const isActive = state.currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 relative ${
                isActive
                  ? 'text-primary'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className={`material-symbols-outlined text-2xl transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className={`text-[9px] font-medium mt-0.5 transition-all duration-200 ${
                isActive ? 'font-semibold' : ''
              }`}>
                {item.label}
              </span>
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute bottom-0 w-12 h-1 bg-primary rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
