/**
 * Bottom Navigation Component
 * 
 * Mobile-optimized bottom navigation bar
 */

import { useApp } from '../store/AppContext';

interface NavItem {
  id: 'dashboard' | 'branches' | 'computers' | 'jira' | 'settings';
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'branches', icon: 'fork_right', label: 'Branches' },
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
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-sidebar-dark border-t border-slate-200 dark:border-border-dark z-30 safe-bottom">
      <div className="flex items-center justify-around h-full max-w-lg mx-auto">
        {navItems.map(item => {
          const isActive = state.currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className={`material-symbols-outlined text-2xl ${isActive ? 'font-bold' : ''}`}>
                {item.icon}
              </span>
              <span className={`font-display text-[9px] uppercase tracking-wider mt-0.5 ${
                isActive ? 'font-bold' : ''
              }`}>
                {item.label}
              </span>
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
