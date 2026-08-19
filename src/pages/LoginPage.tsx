import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { AppUser } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { LogIn, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (supabase) {
        const { data, error: dbError } = await supabase
          .from('app_users')
          .select('id, username, role, password')
          .eq('username', username.trim().toLowerCase())
          .single();

        if (dbError || !data) {
          setError('Invalid username or password.');
          setLoading(false);
          return;
        }

        if (data.password !== password) {
          setError('Invalid username or password.');
          setLoading(false);
          return;
        }

        const user: AppUser = {
          id: data.id,
          username: data.username,
          role: data.role as 'admin' | 'user'
        };

        login(user);
        navigate('/');
      } else {
        if (username === 'admin' && password === 'admin123') {
          login({ id: 'local-admin', username: 'admin', role: 'admin' });
          navigate('/');
        } else {
          setError('Invalid credentials.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!supabase) {
        setError('Database not configured. Cannot sign up.');
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('app_users')
        .insert({
          username: username.trim().toLowerCase(),
          password: password,
          role: 'user',
        });

      if (insertError) {
        if (insertError.code === '23505') {
          setError('Username already taken. Please choose another.');
        } else {
          setError(insertError.message || 'Failed to create account.');
        }
        setLoading(false);
        return;
      }

      setSuccess('Account created successfully! You can now sign in.');
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setMode('login');
        setSuccess('');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-white tracking-tighter">DR</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          {mode === 'login' ? 'Sign in' : 'Create Account'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {mode === 'login'
            ? 'Sign in to access the Duty Roster system'
            : 'Register a new account to get started'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={mode === 'login' ? handleLogin : handleSignup}>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium">{success}</p>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-slate-700">
                Username
              </label>
              <div className="mt-1">
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 sm:text-sm font-medium transition-colors"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 sm:text-sm font-medium transition-colors"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700">
                  Confirm Password
                </label>
                <div className="mt-1">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2.5 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 sm:text-sm font-medium transition-colors"
                    placeholder="Confirm your password"
                  />
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 transition-all items-center gap-2"
              >
                {loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (
                  <>
                    {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    {mode === 'login' ? 'Sign in' : 'Create Account'}
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); resetForm(); }}
              className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
