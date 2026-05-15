import React from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';
import { Medication, PharmacyLocation } from '../types';
import { AlertCircle, ArrowUpRight, CheckCircle2, Package, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardStatsProps {
  medications: Medication[];
}

export default function DashboardStats({ medications }: DashboardStatsProps) {
  const stockStats = React.useMemo(() => {
    let out = 0;
    let low = 0;
    let inStock = 0;

    medications.forEach(m => {
      if (m.qoh <= 0) out++;
      else if (m.maxQty > 0 && m.qoh < m.maxQty * 0.3) low++;
      else inStock++;
    });

    return [
      { name: 'In Stock', value: inStock, color: '#10B981' },
      { name: 'Low Stock', value: low, color: '#F27D26' },
      { name: 'Out of Stock', value: out, color: '#EF4444' }
    ].filter(s => s.value > 0);
  }, [medications]);

  const totalValue = React.useMemo(() => medications.length, [medications]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
      {/* Stock Health Summary */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-[#141414]/5 flex flex-col h-[380px]"
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-[#141414] leading-tight">Stock Health</h3>
            <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest mt-1">Status Overview</p>
          </div>
          <div className="p-2.5 bg-[#F27D26]/10 rounded-xl">
             <Package size={20} className="text-[#F27D26]" />
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stockStats}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stockStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }} 
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-[#141414]">{totalValue}</span>
            <span className="text-[9px] font-bold text-[#141414]/30 uppercase tracking-widest">Total Items</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[#141414]/5">
          {stockStats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[9px] font-bold text-[#141414]/40 uppercase tracking-tight">{stat.name}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Trend Analysis */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="col-span-1 lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-[#141414]/5 flex flex-col h-[380px]"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-sm font-bold text-[#141414] leading-tight">Replenishment Trends</h3>
            <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest mt-1">Inventory Flow Projection</p>
          </div>
          <div className="flex gap-2">
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
               <TrendingUp size={12} />
               Optimal
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: 'Adult', stock: medications.filter(m => m.locationId === PharmacyLocation.ADULT).length, low: medications.filter(m => m.locationId === PharmacyLocation.ADULT && m.qoh < 10).length },
              { name: 'Pediatric', stock: medications.filter(m => m.locationId === PharmacyLocation.PEDIATRIC).length, low: medications.filter(m => m.locationId === PharmacyLocation.PEDIATRIC && m.qoh < 10).length },
              { name: 'Mesaieed', stock: medications.filter(m => m.locationId === PharmacyLocation.MESAIEED).length, low: medications.filter(m => m.locationId === PharmacyLocation.MESAIEED && m.qoh < 10).length },
            ]}>
              <XAxis dataKey="name" fontSize={11} fontWeight="bold" axisLine={false} tickLine={false} />
              <YAxis fontSize={11} fontWeight="bold" axisLine={false} tickLine={false} />
              <Tooltip cursor={{fill: 'rgba(20,20,20,0.02)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }} />
              <Bar dataKey="stock" fill="#141414" radius={[6, 6, 0, 0]} name="Total Inventory" />
              <Bar dataKey="low" fill="#F27D26" radius={[6, 6, 0, 0]} name="Low Stock" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
