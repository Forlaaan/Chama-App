import React, { useState } from 'react';

export default function OnboardingScreen({ token, onComplete, apiFetch, initialFullName }) {
  const [fullName, setFullName] = useState(initialFullName || '');
  const [action, setAction] = useState('JOIN'); // 'JOIN' or 'CREATE'
  const [inviteCode, setInviteCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const body = {
        fullName,
        action,
        inviteCode: action === 'JOIN' ? inviteCode.trim().toUpperCase() : undefined,
        groupName: action === 'CREATE' ? groupName : undefined,
        groupDescription: action === 'CREATE' ? groupDescription : undefined,
      };

      const result = await apiFetch('/api/auth/onboard', {
        method: 'POST',
        token,
        body
      });

      if (result.member) {
        onComplete(result.member, action === 'CREATE' ? result.inviteCode : null);
      } else {
        throw new Error('Onboarding failed. Please try again.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="brand-box">
        <div className="brand-mark">CH</div>
        <p>CHAMA HUB</p>
      </section>

      <h2 style={{ textAlign: 'center', marginBottom: 20 }}>Welcome! Let's get you set up.</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button 
            type="button" 
            className={action === 'JOIN' ? 'primary' : ''} 
            onClick={() => setAction('JOIN')}
            style={{ flex: 1 }}
          >
            Join Chama
          </button>
          <button 
            type="button" 
            className={action === 'CREATE' ? 'primary' : ''} 
            onClick={() => setAction('CREATE')}
            style={{ flex: 1 }}
          >
            Create Chama
          </button>
        </div>

        {action === 'JOIN' ? (
          <>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
              Enter the invite code provided by your Chama administrator.
            </p>
            <label>
              Invite Code
              <input 
                required 
                value={inviteCode} 
                onChange={e => setInviteCode(e.target.value)} 
                placeholder="e.g. CHM-H9B3" 
                style={{ textTransform: 'uppercase' }}
              />
            </label>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
              You will be the Administrator of this new Chama.
            </p>
            <label>
              Chama Name
              <input 
                required 
                value={groupName} 
                onChange={e => setGroupName(e.target.value)} 
                placeholder="e.g. Alpha Investment Group" 
              />
            </label>
            <label>
              Description (Optional)
              <input 
                value={groupDescription} 
                onChange={e => setGroupDescription(e.target.value)} 
                placeholder="Brief description of the group" 
              />
            </label>
          </>
        )}

        {error && <div style={{ color: 'red', marginTop: 10, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" className="primary" disabled={loading} style={{ flex: 2 }}>
            {loading ? 'Processing...' : 'Complete Setup'}
          </button>
        </div>
      </form>
    </div>
  );
}
