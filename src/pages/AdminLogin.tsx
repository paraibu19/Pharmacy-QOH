import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key } from 'lucide-react';
import { motion } from 'motion/react';

interface AdminLoginProps {
  onLogin: () => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, verify against a backend. For now, simple check.
    if (password === 'admin123') {
      onLogin();
      navigate('/admin/dashboard');
    } else {
      setError('Invalid password');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-2xl border border-[#141414]/10 shadow-sm"
      >
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-[#F27D26]/10 rounded-full">
            <Key className="w-8 h-8 text-[#F27D26]" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">Admin Login</h1>
        <p className="text-center text-[#141414]/60 text-sm mb-8">
          Enter your credentials to manage inventory
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
              Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs font-medium ml-1">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#141414]/90 transition-colors"
          >
            Access Dashboard
          </button>
        </form>
      </motion.div>
    </div>
  );
}
