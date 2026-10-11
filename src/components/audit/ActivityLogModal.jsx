import React, { useState } from 'react';
import { X, Activity, Search, Filter, Clock, User, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function ActivityLogModal() {
  const { activeModal, setActiveModal, activityLogs } = useWorkspace();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  if (activeModal !== 'activity') return null;

  const filteredLogs = activityLogs.filter(log => {
    const matchesSearch = log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.userName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'ALL' || log.action === filterType;
    return matchesSearch && matchesFilter;
  });

  const getActionBadgeColor = (action) => {
    if (action.includes('CREATED')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (action.includes('DELETED')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (action.includes('ROLE')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (action.includes('RESTORE')) return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
    return 'bg-brand-500/20 text-brand-400 border-brand-500/30';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-dark-900/60">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-gray-100">Activity Tracking & Audit Logs</h2>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls */}
        <div className="p-3 bg-dark-900 border-b border-gray-800 flex flex-col sm:flex-row gap-2 justify-between items-center">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-800 text-xs text-gray-300 px-2 py-1.5 rounded-lg border border-gray-700 focus:outline-none"
            >
              <option value="ALL">All Event Types</option>
              <option value="FILE_SAVED">File Edits</option>
              <option value="FILE_CREATED">File Creations</option>
              <option value="FILE_DELETED">File Deletions</option>
              <option value="ROLE_UPDATED">RBAC Role Updates</option>
              <option value="USER_JOINED">User Joins</option>
            </select>
          </div>
        </div>

        {/* Log Stream */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-500">
              No audit records match your current search criteria.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-dark-900/80 border border-gray-800/80 rounded-xl hover:border-gray-700 transition-colors flex items-start justify-between text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                    <span className="text-gray-200 font-medium">{log.details}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] text-gray-500">
                    <span className="flex items-center space-x-1">
                      <User className="w-3 h-3 text-gray-400" />
                      <span>{log.userName} ({log.userRole?.toUpperCase()})</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
