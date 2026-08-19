import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Trash2, Shield, User as UserIcon, ShieldCheck } from 'lucide-react';
import type { AppUser } from '../context/AuthContext';

export default function UserManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form state
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      const { data, error: dbError } = await supabase
        .from('app_users')
        .select('id, username, role')
        .order('created_at', { ascending: true });
        
      if (dbError) throw dbError;
      setUsers(data as AppUser[]);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      setAddError('Username and password are required.');
      return;
    }
    
    setAddLoading(true);
    setAddError('');
    
    try {
      if (!supabase) throw new Error('Database not connected');
      
      const { data, error: insertError } = await supabase
        .from('app_users')
        .insert({
          username: newUsername.trim().toLowerCase(),
          password: newPassword, // In a real app, hash this!
          role: newRole
        })
        .select('id, username, role')
        .single();
        
      if (insertError) {
        if (insertError.code === '23505') { // unique violation
          throw new Error('Username already exists.');
        }
        throw insertError;
      }
      
      setUsers([...users, data as AppUser]);
      setShowAdd(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
    } catch (err: any) {
      console.error('Error adding user:', err);
      setAddError(err.message || 'Failed to add user.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (username === 'admin') {
      alert('Cannot delete the default admin user.');
      return;
    }
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;
    
    try {
      if (!supabase) return;
      const { error: deleteError } = await supabase
        .from('app_users')
        .delete()
        .eq('id', id);
        
      if (deleteError) throw deleteError;
      
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user.');
    }
  };

  const handlePromoteUser = async (id: string, username: string) => {
    if (!confirm(`Promote "${username}" to Admin? This cannot be undone.`)) return;

    try {
      if (!supabase) return;
      const { error: updateError } = await supabase
        .from('app_users')
        .update({ role: 'admin' })
        .eq('id', id);

      if (updateError) throw updateError;

      setUsers(users.map(u => u.id === id ? { ...u, role: 'admin' } : u));
    } catch (err: any) {
      console.error('Error promoting user:', err);
      alert('Failed to promote user.');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-sm">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header and Add Button */}
      <div className="flex justify-between items-center px-4 py-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">System Users</h2>
          <p className="text-[11px] text-slate-500">Manage who can access the Duty Roster system.</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
          >
            <Plus className="w-3 h-3" /> Add User
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
          {error}
        </div>
      )}

      {/* Add User Form */}
      {showAdd && (
        <div className="mx-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Create New User</h3>
          <form onSubmit={handleAddUser} className="space-y-4">
            {addError && <p className="text-rose-600 text-xs font-medium">{addError}</p>}
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-500"
                  placeholder="e.g. jdoe"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-500"
                  placeholder="Secret passphrase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as 'admin' | 'user')}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:border-slate-500"
                >
                  <option value="user">User (Limited Access)</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded transition-colors"
              >
                {addLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/60 border-y border-slate-200/60 text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Username</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100/80 hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                    {u.role === 'admin' ? <Shield className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                  </div>
                  {u.username.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    u.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {u.role === 'user' && (
                      <button
                        onClick={() => handlePromoteUser(u.id, u.username)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Promote to Admin"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteUser(u.id, u.username)} 
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Delete User"
                      disabled={u.username === 'admin'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-xs">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
