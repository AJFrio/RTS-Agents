import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

const Repositories: React.FC = () => {
  const { github, loadBranches, selectRepo, setGithubState, openModal } = useApp();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (github.repos.length === 0) {
      loadBranches();
    }
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setFilter(query);
    const filtered = github.repos.filter(repo =>
      repo.name.toLowerCase().includes(query) ||
      (repo.description && repo.description.toLowerCase().includes(query))
    );
    setGithubState({ filteredRepos: filtered });
  };

  if (github.loadingRepos && github.repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
        <p className="mt-4 text-sm text-slate-400 font-medium">Fetching Repositories...</p>
      </div>
    );
  }

  if (github.repos.length === 0 && !github.loadingRepos) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-slate-600 text-6xl">fork_right</span>
        <h3 className="mt-4 text-lg font-semibold dark:text-white tracking-tight">No Repositories Found</h3>
        <p className="mt-2 text-slate-500 text-center max-w-md text-sm">
          Connect your GitHub account in Settings to view branches and PRs.
        </p>
        <button
          onClick={() => { /* Should ideally navigate to settings, using setView */ }}
          className="mt-4 bg-primary text-black px-6 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
        >
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between mb-6">
         <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold dark:text-white tracking-tight">Repositories</h3>
            <span className="text-slate-500 text-xs font-medium">{github.repos.length} repos</span>
         </div>
         <div className="flex items-center gap-3">
           <button
             onClick={() => openModal('createRepo')}
             className="bg-primary text-black flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
           >
              <span className="material-symbols-outlined text-sm">add</span>
              New Repo
           </button>
           <button
             onClick={loadBranches}
             className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400"
           >
              <span className={`material-symbols-outlined text-sm ${github.loadingRepos ? 'animate-spin' : ''}`}>refresh</span>
              Refresh
           </button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full w-full overflow-hidden">
         {/* Repo List */}
         <div className="lg:col-span-1 border border-slate-200 dark:border-border-dark bg-white dark:bg-[#1A1A1A] rounded-xl flex flex-col h-[calc(100vh-200px)] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-border-dark">
               <input
                 type="text"
                 placeholder="Filter repos..."
                 value={filter}
                 onChange={handleFilterChange}
                 className="w-full bg-white dark:bg-black border border-slate-200 dark:border-border-dark text-slate-800 dark:text-slate-300 text-xs py-2 px-3 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
               />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
               {github.filteredRepos.map(repo => (
                 <div
                   key={repo.id}
                   onClick={() => selectRepo(repo.id)}
                   className={`p-3 border border-slate-200 dark:border-transparent hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all mb-1 rounded-lg ${github.selectedRepo?.id === repo.id ? 'bg-primary/10 border-primary' : ''}`}
                 >
                   <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-300 text-sm truncate pr-2">{repo.name}</span>
                      {repo.private && <span className="material-symbols-outlined text-xs text-slate-500">lock</span>}
                   </div>
                   <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                         {repo.open_issues_count > 0 && <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1"><span className="material-symbols-outlined text-xs">bug_report</span> {repo.open_issues_count}</span>}
                         <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1"><span className="material-symbols-outlined text-xs">star</span> {repo.stargazers_count}</span>
                      </div>
                   </div>
                 </div>
               ))}
            </div>
         </div>

         {/* PR List / Details */}
         <div className="lg:col-span-2 border border-slate-200 dark:border-border-dark bg-white dark:bg-[#1A1A1A] rounded-xl flex flex-col h-[calc(100vh-200px)] overflow-hidden">
            {!github.selectedRepo ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                 <span className="material-symbols-outlined text-4xl mb-2">arrow_back</span>
                 <span className="text-sm font-medium">Select a repository</span>
              </div>
            ) : (
              <div className="flex flex-col h-full w-full">
                 <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-center bg-slate-50 dark:bg-black/20">
                    <div>
                       <h2 className="text-xl font-semibold text-slate-800 dark:text-white tracking-tight">{github.selectedRepo.name}</h2>
                    </div>
                    <div className="flex items-center gap-3">
                       <a href={github.selectedRepo.html_url} target="_blank" rel="noopener noreferrer" className="bg-primary text-black px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] flex items-center gap-2 transition-all duration-200">
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          Visit Repo
                       </a>
                       <div className="flex bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-0.5 rounded-lg gap-0.5">
                          <button
                            onClick={() => {
                              setGithubState({ prFilter: 'open' });
                              selectRepo(github.selectedRepo!.id);
                            }}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${github.prFilter === 'open' ? 'bg-primary text-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                          >
                            Open
                          </button>
                          <button
                            onClick={() => {
                              setGithubState({ prFilter: 'closed' });
                              selectRepo(github.selectedRepo!.id);
                            }}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${github.prFilter === 'closed' ? 'bg-primary text-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                          >
                            Closed
                          </button>
                       </div>
                       <span className="px-2 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center">
                          <span className="mr-1">{github.prs.length}</span> <span>PRs</span>
                       </span>
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-4 w-full">
                    {github.loadingPrs ? (
                      <div className="flex flex-col items-center justify-center h-32">
                         <span className="material-symbols-outlined text-primary text-3xl animate-spin">sync</span>
                         <span className="text-sm text-slate-500 mt-2 font-medium">Loading PRs...</span>
                      </div>
                    ) : github.prs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                         <span className="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                         <span className="text-sm font-medium">No {github.prFilter} pull requests</span>
                      </div>
                    ) : (
                      github.prs.map(pr => (
                        <div
                          key={pr.id}
                          onClick={() => openModal('pr', { owner: github.selectedRepo!.owner.login, repo: github.selectedRepo!.name, number: pr.number })}
                          className="pr-card bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm hover:shadow-md hover:border-primary transition-all duration-200 cursor-pointer group p-4 active:scale-[0.98]"
                        >
                           <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                 <span className="text-primary text-xs font-medium">#{pr.number}</span>
                                 <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm group-hover:text-primary transition-colors">{pr.title}</h3>
                              </div>
                              <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${pr.state === 'open' ? 'bg-emerald-500/20 text-emerald-500' : pr.merged_at ? 'bg-purple-500/20 text-purple-500' : 'bg-red-500/20 text-red-500'}`}>
                                {pr.state === 'open' ? 'Open' : pr.merged_at ? 'Merged' : 'Closed'}
                              </span>
                           </div>

                           <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                              <span className="flex items-center gap-1">
                                 <span className="material-symbols-outlined text-xs">account_circle</span>
                                 {pr.user.login}
                              </span>
                              <span className="flex items-center gap-1">
                                 <span className="material-symbols-outlined text-xs">schedule</span>
                                 {new Date(pr.created_at).toLocaleDateString()}
                              </span>
                           </div>

                           <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                 <div className="h-full bg-primary" style={{ width: '100%' }}></div>
                              </div>
                              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                 <span className="material-symbols-outlined text-xs">call_merge</span>
                                 {pr.head.ref}
                              </span>
                           </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default Repositories;
