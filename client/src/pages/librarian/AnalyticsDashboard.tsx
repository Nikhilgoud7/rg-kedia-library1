import React, { useState } from 'react';
import {
  TrendingUp,
  Trophy,
  AlertTriangle,
  Layers,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import CirculationSummaryTab from '../../components/librarian/analytics/CirculationSummaryTab';
import TopBorrowedTitlesTab from '../../components/librarian/analytics/TopBorrowedTitlesTab';
import OverdueAgingTab from '../../components/librarian/analytics/OverdueAgingTab';
import InventoryConditionTab from '../../components/librarian/analytics/InventoryConditionTab';

export type AnalyticsTab = 'circulation' | 'top-borrowed' | 'overdue-loss' | 'inventory';

export const AnalyticsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('circulation');

  const tabs = [
    {
      id: 'circulation' as AnalyticsTab,
      label: 'Circulation Summary',
      icon: TrendingUp,
      description: 'Dispatches, returns, renewals & net flow',
    },
    {
      id: 'top-borrowed' as AnalyticsTab,
      label: 'Top Borrowed Titles',
      icon: Trophy,
      description: 'Ranked titles & borrow frequency',
    },
    {
      id: 'overdue-loss' as AnalyticsTab,
      label: 'Overdue & Loss Analytics',
      icon: AlertTriangle,
      description: '4 aging tiers, lost stock & zero-fine policy',
    },
    {
      id: 'inventory' as AnalyticsTab,
      label: 'Inventory & Shelf Coverage',
      icon: Layers,
      description: 'Condition grading, shelf map & reconciliation drift',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BarChart3 className="w-4 h-4" />
            </span>
            <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
              Librarian Intelligence Console
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mt-1.5 tracking-tight">
            Reports & Institutional Analytics
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-3xl leading-relaxed">
            Real-time circulation metrics, delinquency aging distribution, catalog loss audit records, and physical inventory diagnostics for R.G. Kedia College of Commerce.
          </p>
        </div>
      </div>

      {/* Tab Navigation Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-1.5 shadow-xs">
        <div
          role="tablist"
          aria-label="Analytics Sections"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`p-3.5 rounded-xl text-left transition flex items-start gap-3 focus:outline-hidden focus:ring-2 focus:ring-amber-500 ${
                  isActive
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-950 shadow-xs'
                    : 'bg-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      isActive ? 'text-amber-950' : 'text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {tab.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'circulation' && <CirculationSummaryTab />}
        {activeTab === 'top-borrowed' && <TopBorrowedTitlesTab />}
        {activeTab === 'overdue-loss' && <OverdueAgingTab />}
        {activeTab === 'inventory' && <InventoryConditionTab />}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
