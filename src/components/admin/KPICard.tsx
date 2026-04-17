interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: string;
  subtext?: string;
}

import React from 'react';

export function KPICard({ title, value, icon, color, trend, subtext }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {icon}
        </div>
        {trend && (
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400 mb-1">{title}</p>
      <p className="text-3xl font-black italic" style={{ color }}>
        {value}
      </p>
      {subtext && (
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-300 mt-1">{subtext}</p>
      )}
    </div>
  );
}
