import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

interface AdminLoginProps {
  onLogin: () => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot' | 'change'>('login');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();

  // Simple local persistence for prototype
  const getStoredPassword = () => localStorage.getItem('adminPassword') || 'admin123';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentAdminPassword = getStoredPassword();

    if (mode === 'login') {
      if (password.trim() === currentAdminPassword) {
        onLogin();
        navigate('/admin/dashboard');
      } else {
        setError('Invalid password');
      }
    } else if (mode === 'change') {
      // Check current password
      if (password.trim() !== currentAdminPassword) {
        setError('Current password is incorrect');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      
      // Update persistent password
      localStorage.setItem('adminPassword', newPassword);
      
      alert('Password changed successfully! You can now login with your new password.');
      setMode('login');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    } else if (mode === 'forgot') {
      alert('Password reset link sent to your email (Prototype)');
      setMode('login');
      setPassword('');
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
        
        <h1 className="text-2xl font-bold text-center mb-2">
          {mode === 'login' ? 'Admin Login' : mode === 'forgot' ? 'Reset Password' : 'Change Password'}
        </h1>
        <p className="text-center text-[#141414]/60 text-sm mb-8">
          {mode === 'login' ? 'Enter your credentials to manage inventory' : 
           mode === 'forgot' ? 'Enter your email to receive a reset link' : 
           'Update your administrative access credentials'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'login' && (
            <div className="relative">
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all pr-12"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#141414]/40 hover:text-[#141414] transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="text-center p-4 bg-[#141414]/5 rounded-xl border border-[#141414]/10">
              <p className="text-sm text-[#141414]/60">
                Administrative password resets must be performed by the system owner. Please contact technical support.
              </p>
            </div>
          )}

          {mode === 'change' && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all"
                  placeholder="Current password"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1.5 ml-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#141414]/10 focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all"
                  required
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-red-500 text-xs font-medium ml-1">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#141414]/90 transition-colors"
          >
            {mode === 'login' ? 'Access Dashboard' : mode === 'forgot' ? 'Send Reset Link' : 'Update Password'}
          </button>

          <div className="flex flex-col gap-2 mt-4 text-center">
            {mode === 'login' ? (
              <>
                <button 
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setPassword(''); }}
                  className="text-[#F27D26] text-sm font-medium hover:underline"
                >
                  Forgot Password?
                </button>
                <button 
                  type="button"
                  onClick={() => { setMode('change'); setError(''); setPassword(''); }}
                  className="text-[#141414]/60 text-sm font-medium hover:underline"
                >
                  Change Password
                </button>
              </>
            ) : (
              <button 
                type="button"
                onClick={() => { setMode('login'); setError(''); setPassword(''); }}
                className="text-[#141414]/60 text-sm font-medium hover:underline"
              >
                Back to Login
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
