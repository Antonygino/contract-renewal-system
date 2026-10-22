import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/services';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { User, Building, Mail, Save, Layers } from 'lucide-react';

const DEPARTMENTS = ['Engineering', 'Marketing', 'Legal', 'HR', 'Finance', 'Operations', 'General'];

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name: user?.name || '',
      organization: user?.organization || '',
      department: user?.department || 'Engineering',
    },
  });

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const { data: res } = await authAPI.updateProfile(data);
      const updated = {
        ...user,
        name: res.user.name,
        organization: res.user.organization,
        department: res.user.department,
      };
      updateUser(updated);
      toast.success('Profile & Department updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="page-content">
      <div style={{ maxWidth: 640 }}>
        {/* Profile Header */}
        <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(124,58,237,0.08))', border: '1px solid rgba(79,70,229,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 68, height: 68,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 800, color: '#fff',
              boxShadow: '0 8px 24px rgba(79,70,229,0.3)',
            }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{user?.name}</h2>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: isAdmin ? 'rgba(79, 70, 229, 0.2)' : 'rgba(22, 163, 74, 0.15)',
                  color: isAdmin ? '#818cf8' : '#16a34a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  {isAdmin ? 'ADMINISTRATOR' : 'DEPARTMENT MEMBER'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>{user?.email}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Department: <strong>{user?.department || 'General'}</strong></span>
                <span>•</span>
                <span>Org: <strong>{user?.organization || 'Enterprise'}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Edit Profile & Department</h3>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Your full name"
                  {...register('name', { required: 'Name is required' })}
                />
              </div>
              {errors.name && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.name.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Department</label>
              <div style={{ position: 'relative' }}>
                <Layers size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <select
                  className="form-select"
                  style={{ paddingLeft: 36 }}
                  {...register('department')}
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                Determines the contracts, licenses, and renewal budget scoped to your workspace.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 36 }}
                  value={user?.email}
                  disabled
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Organization</label>
              <div style={{ position: 'relative' }}>
                <Building size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Your organization"
                  {...register('organization')}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="loading-spinner" /> : <><Save size={14} /> Save Profile Changes</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
