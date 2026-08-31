import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  color?: 'amber' | 'blue' | 'emerald' | 'purple' | 'red' | 'indigo';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  subtitle,
  color = 'amber',
  onClick,
}) => {
  const colorMap = {
    amber: 'bg-amber-50 text-amber-600 border-amber-200 hover:border-amber-300',
    blue: 'bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-300',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:border-emerald-300',
    purple: 'bg-purple-50 text-purple-600 border-purple-200 hover:border-purple-300',
    red: 'bg-red-50 text-red-600 border-red-200 hover:border-red-300',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:border-indigo-300',
  };

  const iconBgMap = {
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    purple: 'bg-purple-100 text-purple-700',
    red: 'bg-red-100 text-red-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <h4 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1 tracking-tight">{value}</h4>
          {subtitle && <p className="text-xs text-slate-500 mt-1.5 font-medium">{subtitle}</p>}
        </div>
        <div className={`p-3.5 rounded-xl ${iconBgMap[color]} shadow-xs`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
