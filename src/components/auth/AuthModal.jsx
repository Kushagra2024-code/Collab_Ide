import React, { useState } from 'react';
import { X, Lock, Mail, User, Shield, Github, Chrome, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function AuthModal({ isOpen, onClose }) {
  const { loginSuccess } = useAuth();
  const [mode, setMode] = useState('login'); // 'login', 'register'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState('editor');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        loginSuccess(data.user, data.token);
        onClose();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection error to auth server');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: selectedRole })
      });
      const data = await res.json();
      if (res.ok) {
        loginSuccess(data.user, data.token);
        onClose();
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (res.ok) {
        loginSuccess(data.user, data.token);
        onClose();
      }
    } catch (err) {
      setError('OAuth authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-dark-900/80">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-brand-accent flex items-center justify-center shadow-lg">
              <span className="text-white text-base font-bold">⚡</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Collab IDE Authentication</h2>
              <p className="text-xs text-gray-400">Sign in to your production developer account</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="grid grid-cols-2 p-2 gap-1 bg-dark-900 border-b border-gray-800 text-xs font-semibold">
          <button
            onClick={() => { setMode('login'); setError(null); }}
            className={`py-2 rounded-lg transition-colors ${mode === 'login' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('register'); setError(null); }}
            className={`py-2 rounded-lg transition-colors ${mode === 'register' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Register Account
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
              {error}
            </div>
          )}

          {/* Social OAuth Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOAuthLogin('github')}
              className="py-2 px-3 bg-dark-900 hover:bg-gray-800 border border-gray-700 rounded-xl text-xs font-medium text-white flex items-center justify-center space-x-2 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </button>
            <button
              type="button"
              onClick={() => handleOAuthLogin('google')}
              className="py-2 px-3 bg-dark-900 hover:bg-gray-800 border border-gray-700 rounded-xl text-xs font-medium text-white flex items-center justify-center space-x-2 transition-colors"
            >
              <Chrome className="w-4 h-4 text-blue-400" />
              <span>Google</span>
            </button>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-800"></div>
            <span className="flex-shrink mx-2 text-[10px] text-gray-500 uppercase tracking-wider font-mono">Or continue with email</span>
            <div className="flex-grow border-t border-gray-800"></div>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="developer@collabide.dev"
                    className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center space-x-2"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Workspace Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="editor">Editor (Modify code & collaborate)</option>
                  <option value="admin">Admin (Manage members & settings)</option>
                  <option value="viewer">Viewer (Read-only access)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center space-x-2"
              >
                <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                <Sparkles className="w-4 h-4" />
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
}
