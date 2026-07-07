import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { cacheGet, cacheSet, cacheClearAll } from './cache';
import OnboardingScreen from './OnboardingScreen';

import { Capacitor } from '@capacitor/core';

// VITE_API_BASE_URL should be set in .env when building for a real device.
// e.g. VITE_API_BASE_URL=http://192.168.100.33:4000
let defaultApiUrl = 'http://localhost:4000';
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  defaultApiUrl = 'http://192.168.100.33:4000';
}
const API_BASE_URL = 'http://192.168.100.33:4000';

function money(value) {
  return 'KSH ' + Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toISOString().slice(0, 10);
}

function getMemberName(members, id) {
  const member = members?.find((item) => item.id === id);
  return member ? member.fullName : 'Unknown Member';
}

async function apiFetch(path, options) {
  const settings = options || {};
  const headers = { 
    'Content-Type': 'application/json'
  };
  if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
  
  // Build a cache key that includes the token so different users don't share cached data
  const cacheKey = (settings.token || 'anon') + ':' + path;
  
  try {
    const response = await fetch(API_BASE_URL + path, {
      method: settings.method || 'GET',
      headers,
      body: settings.body ? JSON.stringify(settings.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Request failed');
    
    const data = payload.data === undefined ? payload : payload.data;
    
    // Cache GET responses keyed by token+path
    if ((settings.method || 'GET') === 'GET') {
      cacheSet(cacheKey, data);
    }
    
    return data;
  } catch (error) {
    // Try cache for GET requests if we have a network-level failure
    if (error.name === 'TypeError' && (settings.method || 'GET') === 'GET') {
      const cached = cacheGet(cacheKey);
      if (cached) return cached;
    }
    // Show the REAL error so we can debug — don't mask it
    const url = API_BASE_URL + path;
    throw new Error(`API call to ${url} failed: ${error.name}: ${error.message}`);
  }
}

function App() {
  const [screen, setScreen] = useState('login');
  const [token, setToken] = useState(localStorage.getItem('chamaToken') || '');
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [pendingContributions, setPendingContributions] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [pendingPenalties, setPendingPenalties] = useState([]);
  const [language, setLanguage] = useState('en');
  const [currentMember, setCurrentMember] = useState(null);
  const [inviteCode, setInviteCode] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const role = currentMember?.role || 'MEMBER';

  const navItems = useMemo(() => [
    { id: 'member', label: 'Dashboard', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'reports', label: 'Reports', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'submitContribution', label: 'Contribute', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'requestLoan', label: 'Request Loan', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'treasurer', label: 'Treasurer', roles: ['TREASURER'] },
    { id: 'admin', label: 'Admin', roles: ['ADMIN'] },
    { id: 'superadmin', label: 'Platform', roles: ['SUPERADMIN'] },
    { id: 'members', label: 'Members', roles: ['MEMBER', 'TREASURER', 'ADMIN', 'SUPERADMIN'] }
  ], []);

  function getHomeScreen(memberRole) {
    switch (memberRole) {
      case 'SUPERADMIN': return 'superadmin';
      case 'ADMIN': return 'admin';
      case 'TREASURER': return 'treasurer';
      case 'MEMBER': 
      default: return 'member';
    }
  }

  async function refreshData(authToken = token) {
    if (!authToken) return;
    setLoading(true);
    setNotice('');
    try {
      // 1. Fetch user profile first
      const profile = await apiFetch('/api/auth/profile', { token: authToken });
      
      if (!profile.member) {
        // User is authenticated but has not joined/created a Chama
        setScreen('onboard');
        setLoading(false);
        return;
      }

      // User has a Chama or is SuperAdmin. Update state.
      setCurrentMember(profile.member);
      setInviteCode(profile.inviteCode);
      
      // Route to the correct home screen based on role
      setScreen(prev => {
        if (prev === 'login' || prev === 'onboard') {
          return getHomeScreen(profile.member.role);
        }
        return prev;
      });

      // 2. Fetch standard data (Dashboard content)
      if (profile.member.groupId) {
        const liveMembers = await apiFetch('/api/members', { token: authToken });
        const liveTransactions = await apiFetch('/api/transactions', { token: authToken });
        setMembers(liveMembers || []);
        setTransactions(liveTransactions || []);
        
        // Try to load loans for the entire group
        try {
          const allLoansRes = await apiFetch('/api/loans', { token: authToken });
          setLoans(Array.isArray(allLoansRes) ? allLoansRes : []);
        } catch (e) {
          // ignore
        }
        
        if (profile.member.role === 'TREASURER' || profile.member.role === 'ADMIN') {
          try {
            const pcRes = await apiFetch('/api/contributions/pending', { token: authToken });
            setPendingContributions(Array.isArray(pcRes) ? pcRes : []);
          } catch (e) { }
        }

        try {
          const penRes = await apiFetch('/api/penalties/member/' + profile.member.id, { token: authToken });
          setPenalties(Array.isArray(penRes) ? penRes : []);
        } catch (e) { }

        if (profile.member.role === 'ADMIN' || profile.member.role === 'SUPERADMIN') {
          try {
            const ppRes = await apiFetch('/api/penalties/pending', { token: authToken });
            setPendingPenalties(Array.isArray(ppRes) ? ppRes : []);
          } catch (e) { }
        }
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  // Effect to load initial data if token exists
  useEffect(() => {
    if (token) {
      refreshData(token);
    } else {
      // No token — make sure we're on the login screen
      setScreen('login');
      setCurrentMember(null);
    }
  }, [token]);

  async function recordContribution(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { memberId: data.memberId, amount: data.amount, description: data.description || 'Member contribution payment' };
    await apiFetch('/api/transactions/contributions', { token, method: 'POST', body });
    await refreshData();
    return 'Contribution recorded.';
  }

  async function submitContributionRequestAction(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/contributions/request', { token, method: 'POST', body: { amount: data.amount, cycle: data.cycle } });
    await refreshData();
    return 'Contribution request submitted for approval.';
  }

  async function submitMpesaContribution(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/mpesa/stkpush', { token, method: 'POST', body: { amount: data.amount, reference: 'CONTRIBUTION', description: 'Chama Contribution' } });
    return 'M-Pesa prompt sent to your phone. Please enter your PIN.';
  }

  async function submitMpesaRepayment(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/mpesa/stkpush', { token, method: 'POST', body: { amount: data.amount, reference: 'REPAYMENT:' + data.loanId, description: 'Loan Repayment' } });
    return 'M-Pesa prompt sent to your phone. Please enter your PIN.';
  }

  async function requestLoanAction(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { memberId: currentMember.id, groupId: currentMember.groupId, principalAmount: data.principalAmount, interestRate: data.interestRate, dueDate: data.dueDate, description: data.description || 'Loan request' };
    await apiFetch('/api/loans/request', { token, method: 'POST', body });
    await refreshData();
    return 'Loan request submitted.';
  }

  async function treasurerApproveLoan(loanId) {
    await apiFetch('/api/loans/' + loanId + '/treasurer-approve', { token, method: 'PATCH' });
    setNotice('Loan treasurer-approved.');
    await refreshData();
  }

  async function adminApproveLoan(loanId) {
    await apiFetch('/api/loans/' + loanId + '/admin-approve', { token, method: 'PATCH' });
    setNotice('Loan fully approved and disbursed.');
    await refreshData();
  }
  
  async function rejectLoan(loanId) {
    const userReason = window.prompt("Enter rejection reason:");
    if (userReason === null) return; // User cancelled
    await apiFetch('/api/loans/' + loanId + '/reject', { token, method: 'PATCH', body: { reason: userReason || 'No reason provided' } });
    setNotice('Loan rejected.');
    await refreshData();
  }

  async function confirmContribution(id) {
    await apiFetch('/api/contributions/' + id + '/confirm', { token, method: 'PATCH' });
    setNotice('Contribution confirmed.');
    await refreshData();
  }

  async function rejectContributionReq(id) {
    await apiFetch('/api/contributions/' + id + '/reject', { token, method: 'PATCH', body: { reason: 'Rejected by treasurer' } });
    setNotice('Contribution request rejected.');
    await refreshData();
  }

  async function applyPenaltySweep() {
    if (!window.confirm("Are you sure you want to sweep for late contributions and apply penalties for this cycle?")) return;
    try {
      const res = await apiFetch('/api/penalties/sweep', { token, method: 'POST' });
      setNotice(res.message);
      await refreshData();
    } catch (err) {
      setNotice('Failed to apply penalties: ' + err.message);
    }
  }

  async function submitManualPenalty(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/penalties/apply', { token, method: 'POST', body: { memberId: data.memberId, amount: data.amount, reason: data.reason } });
    await refreshData();
    return 'Manual penalty requested. Awaiting admin approval.';
  }

  async function approvePenalty(id) {
    await apiFetch('/api/penalties/' + id + '/approve', { token, method: 'PATCH' });
    setNotice('Penalty approved.');
    await refreshData();
  }

  async function rejectPenaltyAction(id) {
    await apiFetch('/api/penalties/' + id + '/reject', { token, method: 'PATCH' });
    setNotice('Penalty rejected.');
    await refreshData();
  }

  async function submitMpesaPenaltyPayment(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/mpesa/stkpush', { token, method: 'POST', body: { amount: data.amount, reference: 'PENALTY:' + data.penaltyId, description: 'Penalty Payment' } });
    return 'M-Pesa prompt sent to your phone. Please enter your PIN.';
  }

  async function handleLogout() {
    try { await auth.signOut(); } catch (e) { /* ignore if mock login */ }
    localStorage.removeItem('chamaToken');
    cacheClearAll(); // Clear all cached API data so stale profiles don't persist
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (e) { /* ignore */ }
      window.recaptchaVerifier = null;
    }
    setToken('');
    setCurrentMember(null);
    setMembers([]);
    setTransactions([]);
    setLoans([]);
    setPendingContributions([]);
    setPenalties([]);
    setPendingPenalties([]);
    setInviteCode(null);
    setNotice('');
    setScreen('login');
  }

  async function recordRepayment(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/loans/' + data.loanId + '/repay', { token, method: 'POST', body: { amount: data.amount, description: data.description } });
    await refreshData();
    return 'Repayment recorded.';
  }

  async function removeMember(memberId) {
    if (!window.confirm("Are you sure you want to remove this member from the Chama?")) return;
    await apiFetch('/api/members/' + memberId + '/remove', { token, method: 'POST' });
    setNotice('Member removed from Chama.');
    await refreshData();
  }

  async function sendSms(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/notifications/sms/test', { token, method: 'POST', body: data });
    return 'SMS test submitted.';
  }

  const pendingLoans = loans.filter((loan) => loan.status === 'PENDING');
  const treasurerApprovedLoans = loans.filter((loan) => loan.status === 'TREASURER_APPROVED');
  const memberLoans = loans.filter((loan) => loan.memberId === currentMember?.id);
  const memberTransactions = transactions.filter((tx) => tx.memberId === currentMember?.id);

  if (!currentMember && screen !== 'login' && screen !== 'onboard') {
    return <div className="shell">Loading member profile...</div>;
  }

  return <main className="shell">
    {!isOnline && <div style={{background: 'red', color: 'white', textAlign: 'center', padding: '4px'}}>You are currently offline</div>}
    
    {screen === 'login' ? <LoginScreen language={language} setLanguage={setLanguage} setToken={setToken} setScreen={setScreen} /> : 
     screen === 'onboard' ? <OnboardingScreen apiFetch={apiFetch} onCancel={() => setScreen('login')} onComplete={(newToken, member, code) => {
        setToken(newToken);
        localStorage.setItem('chamaToken', newToken);
        setCurrentMember(member);
        setInviteCode(code);
        setScreen(member.role === 'ADMIN' ? 'admin' : 'member');
        refreshData(newToken);
     }} /> : <>
      <TopBar screen={screen} role={role} setScreen={setScreen} currentMember={currentMember} loading={loading} onLogout={handleLogout} />
      <nav className="tabs">{navItems.filter((item) => item.roles.includes(role)).map((item) => <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => setScreen(item.id)}>{item.label}</button>)}</nav>
      {notice && <div className="notice">{notice}</div>}
      
      {screen === 'member' && <MemberDashboard member={currentMember} transactions={memberTransactions} allTransactions={transactions} loans={memberLoans} members={members} penalties={penalties} go={setScreen} submitMpesaPenaltyPayment={submitMpesaPenaltyPayment} />}
      
      {screen === 'treasurer' && <TreasurerPanel members={members} pendingLoans={pendingLoans} pendingContributions={pendingContributions} approveLoan={treasurerApproveLoan} rejectLoan={rejectLoan} confirmContribution={confirmContribution} rejectContributionReq={rejectContributionReq} applyPenaltySweep={applyPenaltySweep} go={setScreen} />}
      
      {screen === 'admin' && <AdminPanel members={members} treasurerApprovedLoans={treasurerApprovedLoans} pendingPenalties={pendingPenalties} approveLoan={adminApproveLoan} rejectLoan={rejectLoan} approvePenalty={approvePenalty} rejectPenalty={rejectPenaltyAction} go={setScreen} inviteCode={inviteCode} />}
      
      {screen === 'superadmin' && <SuperAdminDashboard token={token} apiFetch={apiFetch} />}
      
      {screen === 'recordContribution' && <FormScreen title="Record Contribution" onBack={() => setScreen('treasurer')} onSubmit={recordContribution} successText="Confirmation message will appear here"><MemberSelect members={members} /><label>Contribution Amount (KSH)<input name="amount" inputMode="decimal" defaultValue="5000" /></label><label>Date<input name="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Description<input name="description" defaultValue="Monthly contribution" /></label></FormScreen>}
      
      {screen === 'submitContribution' && <FormScreen title="Contribute" onBack={() => setScreen('member')} onSubmit={submitContributionRequestAction} submitText="Request Approval" successText="Your request is pending treasurer approval."><label>Amount (KSH)<input name="amount" inputMode="decimal" defaultValue="2000" /></label><label>Cycle (Optional)<input name="cycle" defaultValue="July 2026" /></label><div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}><button type="button" onClick={(e) => { e.preventDefault(); submitMpesaContribution(e.target.form).then(setNotice).catch(err => setNotice(err.message)); }} style={{ background: '#4CAF50', color: 'white' }}>Pay instantly via M-Pesa</button></div></FormScreen>}

      {screen === 'requestLoan' && <FormScreen title="Request Loan" onBack={() => setScreen('member')} onSubmit={requestLoanAction} successText="Loan request status will appear here"><label>Principal Amount (KSH)<input name="principalAmount" defaultValue="10000" /></label><label>Interest Rate<input name="interestRate" defaultValue="0.10" /></label><label>Due Date<input name="dueDate" type="date" defaultValue="2026-07-15" /></label><label>Description<input name="description" defaultValue="Emergency loan request" /></label></FormScreen>}
      
      {screen === 'memberRepayment' && <FormScreen title="Repay Loan via M-Pesa" onBack={() => setScreen('member')} onSubmit={submitMpesaRepayment} successText="Check your phone for the M-Pesa prompt"><input type="hidden" name="loanId" value={loans.find(l => l.memberId === currentMember.id && ['ACTIVE','OVERDUE'].includes(l.status))?.id || ''} /><label>Amount (KSH)<input name="amount" defaultValue={loans.find(l => l.memberId === currentMember.id && ['ACTIVE','OVERDUE'].includes(l.status))?.totalRepayable || ''} /></label></FormScreen>}
      
      {screen === 'manualPenalty' && <FormScreen title="Apply Manual Penalty" onBack={() => setScreen('treasurer')} onSubmit={submitManualPenalty} successText="Check your admin panel"><MemberSelect members={members} /><label>Amount (KSH)<input name="amount" defaultValue="200" /></label><label>Reason<input name="reason" defaultValue="Missed meeting" /></label></FormScreen>}
      
      {screen === 'repayment' && <RepaymentScreen loans={loans} members={members} onSubmit={recordRepayment} onBack={() => setScreen('treasurer')} />}
      
      {screen === 'members' && <MembersScreen members={members} removeMember={removeMember} />}
      
      {screen === 'reports' && <ReportsScreen token={token} apiFetch={apiFetch} members={members} transactions={transactions} loans={loans} />}
      
      {screen === 'sms' && <SmsScreen members={members} sendSms={sendSms} />}
    </>}
  </main>;
}

function LoginScreen({ setToken, setScreen }) {
  const [phoneNumber, setPhoneNumber] = useState('+254');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (pin.length !== 6) {
      setError('PIN must be exactly 6 digits.');
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { phoneNumber, pin }
      });
      
      const token = response.token;
      setToken(token);
      localStorage.setItem('chamaToken', token);
      
    } catch (e) {
      setError(e.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="login-screen">
    <section className="brand-box"><div className="brand-mark">CH</div><p>CHAMA HUB</p></section>
    
    <form onSubmit={handleLogin}>
      <label>Phone Number<input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+254 000 000 000" /></label>
      <br/>
      <label>6-Digit PIN<input type="password" inputMode="numeric" maxLength="6" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="123456" /></label>
      <br/>
      <button type="submit" className="primary bottom-action" disabled={loading || phoneNumber.trim().length < 9 || pin.length !== 6}>{loading ? 'Verifying...' : 'Secure Login'}</button>
      
      {error && <div style={{color: 'red', marginTop: 10}}>{error}</div>}
      
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#666' }}>Don't have an account?</p>
        <button type="button" onClick={() => setScreen('onboard')} style={{ background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', padding: '10px 20px', borderRadius: '4px', marginTop: '10px', width: '100%' }}>Register / Join Chama</button>
      </div>
    </form>
  </div>;
}

function TopBar({ screen, role, setScreen, currentMember, loading, onLogout }) {
  const titles = { member: 'Chama System', superadmin: 'Platform Admin', admin: 'Admin Panel', treasurer: 'Treasurer Panel', submitContribution: 'Contribute', recordContribution: 'Record Contribution', requestLoan: 'Request Loan', repayment: 'Record Repayment', members: 'Members', reports: 'Financial Reports', sms: 'SMS Test' };
  
  function getHome() {
    if (role === 'SUPERADMIN') return 'superadmin';
    if (role === 'ADMIN') return 'admin';
    if (role === 'TREASURER') return 'treasurer';
    return 'member';
  }
  
  return <header className="topbar">
    {screen !== getHome() && screen !== 'member' && <button className="icon-button" onClick={() => setScreen(getHome())}>{'<-'}</button>}
    <strong>{titles[screen] || 'Chama System'}</strong>
    <div className="top-actions">
      {loading && <span className="tiny">Sync</span>}
      <button style={{ background: 'transparent', border: 'none', color: 'white', textDecoration: 'underline' }} onClick={onLogout}>Logout</button>
      <span className="avatar">{currentMember?.fullName?.slice(0, 1)}</span>
    </div>
  </header>;
}

function MemberDashboard({ member, transactions, allTransactions, loans, members, penalties, go, submitMpesaPenaltyPayment }) {
  const activeLoan = loans.find((loan) => loan.memberId === member.id && ['ACTIVE', 'OVERDUE'].includes(loan.status));
  const totalContributions = transactions.filter((tx) => tx.transactionType === 'CONTRIBUTION').reduce((sum, tx) => sum + Number(tx.amount), 0);
  const unsettledPenalties = penalties ? penalties.filter(p => p.settled === 0) : [];
  
  const firstName = member?.fullName?.split(' ')[0] || '';

  return <div className="screen-stack">
    <h2 style={{ margin: '0 0 -10px 0', color: 'var(--primary)' }}>Welcome {firstName}</h2>
    <section className="wire-card">
      <p className="eyebrow">Personal Balance</p>
      <h1>{money(member.accountBalance)}</h1>
      <div className="line" />
      <p>Total Contributions: {money(totalContributions)}</p>
      <button style={{marginTop: 15}} className="primary" onClick={() => go('submitContribution')}>Make Contribution</button>
    </section>

    {unsettledPenalties.length > 0 && (
      <section className="wire-card" style={{borderColor: 'var(--danger)'}}>
        <p className="eyebrow strong" style={{color: 'var(--danger)'}}>Unpaid Penalties</p>
        {unsettledPenalties.map(p => (
          <div className="queue-row" key={p.id}>
            <div><strong>{p.reason}</strong><p>{p.cycle || 'No cycle'}</p></div>
            <div className="right">
              <p>{money(p.amount)}</p>
              <form onSubmit={async (e) => { e.preventDefault(); const res = await submitMpesaPenaltyPayment(e.target); alert(res); }}>
                <input type="hidden" name="amount" value={p.amount} />
                <input type="hidden" name="penaltyId" value={p.id} />
                <button type="submit" style={{marginTop: 5, background: 'var(--danger)', color: 'white'}}>Pay Penalty</button>
              </form>
            </div>
          </div>
        ))}
      </section>
    )}

    <section className="wire-card two-col">
      <div>
        <p className="eyebrow">Outstanding Loans</p>
        <strong>{activeLoan ? activeLoan.status : 'None'}</strong>
        <p>Due Date</p>
        {activeLoan ? 
          <button style={{marginTop: 15}} className="primary" onClick={() => go('memberRepayment')}>Repay Loan</button> :
          <button style={{marginTop: 15}} className="primary" onClick={() => go('requestLoan')}>Request Loan</button>
        }
      </div>
      <div className="right">
        <p>{activeLoan ? money(Number(activeLoan.totalRepayable) - Number(activeLoan.amountPaid)) : 'KSH 0'}</p>
        <p>{activeLoan ? activeLoan.dueDate : '-'}</p>
      </div>
    </section>
    <section className="wire-card">
      <p className="eyebrow strong">Shared Ledger Activity</p>
      {allTransactions.slice(0, 5).map((tx) => <LedgerRow key={tx.id} name={getMemberName(members, tx.memberId)} type={tx.transactionType} amount={tx.amount} />)}
    </section>
  </div>;
}

function TreasurerPanel({ members, pendingLoans, pendingContributions, approveLoan, rejectLoan, confirmContribution, rejectContributionReq, applyPenaltySweep, go }) {
  return <div className="screen-stack">
    <div className="action-grid">
      <ActionTile icon="+" label="Record Contribution" onClick={() => go('recordContribution')} />
      <ActionTile icon="R" label="Record Repayment" onClick={() => go('repayment')} />
      <ActionTile icon="!" label="Apply Penalty" onClick={() => go('manualPenalty')} />
      <ActionTile icon="*" label="Run Penalty Sweep" onClick={applyPenaltySweep} />
      <ActionTile icon="=" label="Reports" onClick={() => go('reports')} />
    </div>

    <section className="wire-card">
      <p className="eyebrow strong">Pending Contributions</p>
      {(!pendingContributions || pendingContributions.length === 0) && <p>No pending contributions.</p>}
      {pendingContributions && pendingContributions.map((req) => <div className="queue-row" key={req.id}>
        <div><strong>{req.memberName}</strong><p>{money(req.amount)}</p><p style={{fontSize: 10}}>{req.cycle || 'No cycle'}</p></div>
        <div className="right">
          <button onClick={() => confirmContribution(req.id)}>Confirm</button>
          <button style={{background: 'var(--danger)', color: 'white', marginTop: 4}} onClick={() => rejectContributionReq(req.id)}>Reject</button>
        </div>
      </div>)}
    </section>

    <section className="wire-card">
      <p className="eyebrow strong">Pending Loans (Treasurer Initial Approval)</p>
      {pendingLoans.length === 0 && <p>No pending loan requests.</p>}
      {pendingLoans.map((loan) => <div className="queue-row" key={loan.id}>
        <div><strong>{getMemberName(members, loan.memberId)}</strong><p>{money(loan.principalAmount)}</p></div>
        <div className="right">
          <button onClick={() => approveLoan(loan.id)}>Approve</button>
          <button style={{background: 'var(--danger)', color: 'white', marginTop: 4}} onClick={() => rejectLoan(loan.id)}>Reject</button>
        </div>
      </div>)}
    </section>
  </div>;
}

function AdminPanel({ members, treasurerApprovedLoans, pendingPenalties, approveLoan, rejectLoan, approvePenalty, rejectPenalty, go, inviteCode }) {
  return <div className="screen-stack">
    {inviteCode && (
      <section className="wire-card" style={{ background: 'var(--primary)', color: 'white' }}>
        <p className="eyebrow strong" style={{ color: 'white', opacity: 0.9 }}>Group Invite Code</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: '8px 0', letterSpacing: '2px' }}>{inviteCode}</h2>
          <button style={{ background: 'white', color: 'var(--primary)', border: 'none', padding: '4px 8px', borderRadius: '4px' }} onClick={() => navigator.clipboard.writeText(inviteCode)}>Copy</button>
        </div>
        <p style={{ fontSize: '12px', margin: 0, opacity: 0.9 }}>Share this code with new members so they can join your Chama.</p>
      </section>
    )}

    {pendingPenalties && pendingPenalties.length > 0 && (
      <section className="wire-card">
        <p className="eyebrow strong">Pending Penalties</p>
        {pendingPenalties.map(p => (
          <div className="queue-row" key={p.id}>
            <div><strong>{getMemberName(members, p.memberId)}</strong><p>{p.reason} ({money(p.amount)})</p></div>
            <div className="right">
              <button onClick={() => approvePenalty(p.id)}>Approve</button>
              <button style={{background: 'var(--danger)', color: 'white', marginTop: 4}} onClick={() => rejectPenalty(p.id)}>Reject</button>
            </div>
          </div>
        ))}
      </section>
    )}

    <div className="action-grid">
      <ActionTile icon="U" label="Manage Members" onClick={() => go('members')} />
      <ActionTile icon="S" label="Test SMS" onClick={() => go('sms')} />
    </div>
    <section className="wire-card">
      <p className="eyebrow strong">Treasurer Approved Loans (Final Approval)</p>
      {treasurerApprovedLoans.length === 0 && <p>No loans awaiting final approval.</p>}
      {treasurerApprovedLoans.map((loan) => <div className="queue-row" key={loan.id}>
        <div><strong>{getMemberName(members, loan.memberId)}</strong><p>{money(loan.principalAmount)}</p></div>
        <div className="right">
          <button onClick={() => approveLoan(loan.id)}>Approve</button>
          <button style={{background: 'var(--danger)', color: 'white', marginTop: 4}} onClick={() => rejectLoan(loan.id)}>Reject</button>
        </div>
      </div>)}
    </section>
  </div>;
}

function ActionTile({ icon, label, onClick }) {
  return <button className="action-tile" onClick={onClick}><span>{icon}</span><strong>{label}</strong></button>;
}

function LedgerRow({ name, type, amount }) {
  return <div className="ledger-row"><div><strong>{name}</strong><p>{type.replaceAll('_', ' ')}</p></div><span>{money(amount)}</span></div>;
}

function MemberSelect({ members, currentMemberId }) {
  return <label>Select Member<select name="memberId" defaultValue={currentMemberId || members[1]?.id || members[0]?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select></label>;
}

function FormScreen({ onSubmit, successText, children }) {
  const [message, setMessage] = useState(successText);
  const [busy, setBusy] = useState(false);
  return <form className="form-screen" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { setMessage(await onSubmit(event.currentTarget)); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}>{children}<button className="primary" disabled={busy}>{busy ? 'Working...' : 'Submit'}</button><div className="confirmation">{message}</div></form>;
}

function RepaymentScreen({ loans, members, onSubmit, onBack }) {
  const activeLoans = loans.filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status));
  return <FormScreen title="Record Repayment" onBack={onBack} onSubmit={onSubmit} successText="Repayment confirmation will appear here"><label>Select Loan<select name="loanId">{activeLoans.map((loan) => <option key={loan.id} value={loan.id}>{getMemberName(members, loan.memberId)} - {money(loan.totalRepayable)}</option>)}</select></label><label>Repayment Amount (KSH)<input name="amount" defaultValue="1000" /></label><label>Description<input name="description" defaultValue="Loan repayment" /></label></FormScreen>;
}

function MembersScreen({ members, removeMember }) {
  const activeMembers = members.filter(m => m.status !== 'DEACTIVATED' && m.groupId !== null);
  
  return <div className="screen-stack">
    <section className="wire-card">
      <p className="eyebrow strong">Member Directory</p>
      {activeMembers.map((member) => (
        <div className="queue-row" key={member.id}>
          <div>
            <strong>{member.fullName}</strong>
            <p>{member.phoneNumber}</p>
          </div>
          <div className="right">
            <p>{member.role}</p>
            {member.role !== 'ADMIN' && (
              <button style={{background: 'var(--danger)', color: 'white', marginTop: 4}} onClick={() => removeMember(member.id)}>
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  </div>;
}

function ReportsScreen({ token, apiFetch, members, transactions, loans }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [matrix, setMatrix] = useState([]);
  const [loanBook, setLoanBook] = useState(null);

  useEffect(() => {
    async function fetchReports() {
      try {
        if (activeTab === 'summary' && !summary) {
          const s = await apiFetch('/api/reports/summary', { token });
          setSummary(s);
        } else if (activeTab === 'contributions' && matrix.length === 0) {
          const m = await apiFetch('/api/reports/matrix', { token });
          setMatrix(m);
        } else if (activeTab === 'loans' && !loanBook) {
          const l = await apiFetch('/api/reports/loanbook', { token });
          setLoanBook(l);
        }
      } catch (err) {
        console.error('Failed to fetch reports', err);
      }
    }
    fetchReports();
  }, [activeTab, token, summary, matrix.length, loanBook, apiFetch]);

  return <div className="screen-stack">
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 0' }}>
      <button className={activeTab === 'summary' ? 'primary' : ''} onClick={() => setActiveTab('summary')}>Summary</button>
      <button className={activeTab === 'contributions' ? 'primary' : ''} onClick={() => setActiveTab('contributions')}>Contributions</button>
      <button className={activeTab === 'loans' ? 'primary' : ''} onClick={() => setActiveTab('loans')}>Loan Book</button>
      <button className={activeTab === 'ledger' ? 'primary' : ''} onClick={() => setActiveTab('ledger')}>Ledger</button>
    </div>

    {activeTab === 'summary' && summary && (
      <div className="screen-stack">
        <section className="wire-card">
          <p className="eyebrow strong">Group Financial Health</p>
          <h2>{money(summary.totalCollected)}</h2>
          <p>Total Contributions</p>
          <hr style={{ margin: '10px 0', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
          <h2>{money(summary.totalOutstandingLoans)}</h2>
          <p>Active & Overdue Loans</p>
          <hr style={{ margin: '10px 0', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
          <h2>{money(summary.totalLoanRepayments)}</h2>
          <p>Total Repayments</p>
        </section>
      </div>
    )}

    {activeTab === 'contributions' && matrix.length > 0 && (
      <div className="screen-stack">
        <section className="wire-card">
          <p className="eyebrow strong">Member Contributions</p>
          {matrix.map(m => (
            <div className="queue-row" key={m.memberId}>
              <div><strong>{m.fullName}</strong><p>Balance: {money(m.balance)}</p></div>
              <div className="right">
                <strong>{money(m.totalContributions)}</strong>
                <p style={{ fontSize: 10 }}>lifetime</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    )}

    {activeTab === 'loans' && loanBook && (
      <div className="screen-stack">
        <section className="wire-card">
          <p className="eyebrow strong">Loan Book Overview</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
            <div><strong>Active</strong><br/>{loanBook.active}</div>
            <div><strong>Overdue</strong><br/>{loanBook.overdue}</div>
            <div><strong>Paid</strong><br/>{loanBook.paid}</div>
            <div><strong>Pending</strong><br/>{loanBook.pending}</div>
          </div>
          {loanBook.loans.map(l => (
            <div className="queue-row" key={l.id}>
              <div><strong>{l.memberName}</strong><p>{l.status} / due {shortDate(l.dueDate)}</p></div>
              <div className="right">
                <p>{money(l.totalRepayable)}</p>
                <p style={{ fontSize: 10 }}>Paid {money(l.amountPaid)}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    )}

    {activeTab === 'ledger' && (
      <div className="screen-stack">
        <section className="wire-card">
          <p className="eyebrow strong">Transaction Ledger</p>
          {transactions.map((tx) => (
            <div className="queue-row" key={tx.id}>
              <div><strong>{getMemberName(members, tx.memberId)}</strong><p>{tx.description || tx.transactionType}</p></div>
              <div className="right"><p>{money(tx.amount)}</p><p>{shortDate(tx.timestamp)}</p></div>
            </div>
          ))}
        </section>
      </div>
    )}
  </div>;
}

function SmsScreen({ members, sendSms }) {
  return <div className="screen-stack"><FormPanel submitText="Send SMS Test" onSubmit={sendSms}><label>Recipient<select name="phoneNumber">{members.map((member) => <option key={member.id} value={member.phoneNumber}>{member.fullName} - {member.phoneNumber}</option>)}</select></label><label>Message<textarea name="message" defaultValue="Hello John Doe, this is a Chama Hub SMS test." /></label></FormPanel></div>;
}

function FormPanel({ children, onSubmit, submitText }) {
  const [message, setMessage] = useState('');
  return <form className="wire-card mini-form" onSubmit={async (event) => { event.preventDefault(); try { setMessage(await onSubmit(event.currentTarget)); } catch (error) { setMessage(error.message); } }}>{children}<button className="primary">{submitText}</button>{message && <div className="confirmation">{message}</div>}</form>;
}

function SuperAdminDashboard({ token, apiFetch }) {
  const [chamas, setChamas] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('chamas');

  async function load() {
    try {
      const c = await apiFetch('/api/superadmin/chamas', { token });
      const m = await apiFetch('/api/superadmin/members', { token });
      setChamas(c || []);
      setMembers(m || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  async function handleDeactivate(id) {
    if (!window.confirm('Are you sure you want to deactivate this member?')) return;
    try {
      await apiFetch(`/api/superadmin/members/${id}/deactivate`, { token, method: 'PATCH' });
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReactivate(id) {
    if (!window.confirm('Are you sure you want to reactivate this member?')) return;
    try {
      await apiFetch(`/api/superadmin/members/${id}/reactivate`, { token, method: 'PATCH' });
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="shell">Loading platform data...</div>;
  if (error) return <div className="notice">{error}</div>;

  const activeMembers = members.filter(m => m.status !== 'DEACTIVATED');
  const deactivatedMembers = members.filter(m => m.status === 'DEACTIVATED');

  return <div className="screen-stack">
    <section className="wire-card">
      <p className="eyebrow strong">Platform Overview</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <div><strong>Total Chamas</strong><p>{chamas.length}</p></div>
        <div><strong>Total Members</strong><p>{members.length}</p></div>
      </div>
    </section>

    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 0' }}>
      <button className={activeTab === 'chamas' ? 'primary' : ''} onClick={() => setActiveTab('chamas')}>All Chamas</button>
      <button className={activeTab === 'active_members' ? 'primary' : ''} onClick={() => setActiveTab('active_members')}>Active Members</button>
      <button className={activeTab === 'deactivated_members' ? 'primary' : ''} onClick={() => setActiveTab('deactivated_members')}>Deactivated</button>
    </div>
    
    {activeTab === 'chamas' && (
      <section className="wire-card">
        <p className="eyebrow strong">All Chamas</p>
        {chamas.map(g => (
          <div className="queue-row" key={g.id}>
            <div><strong>{g.name}</strong><p>{g.memberCount} members</p></div>
            <div className="right">
              <p>{money(g.totalContributions)}</p>
              <p style={{ fontSize: 10 }}>{g.id}</p>
            </div>
          </div>
        ))}
      </section>
    )}

    {activeTab === 'active_members' && (
      <section className="wire-card">
        <p className="eyebrow strong">Active Members</p>
        {activeMembers.length === 0 && <p>No active members.</p>}
        {activeMembers.map(m => (
          <div className="queue-row" key={m.id}>
            <div><strong>{m.fullName}</strong><p>{m.phoneNumber} ({m.groupName || 'No group'})</p></div>
            <div className="right">
              <button style={{background: 'var(--danger)', color: 'white'}} onClick={() => handleDeactivate(m.id)}>Deactivate</button>
            </div>
          </div>
        ))}
      </section>
    )}

    {activeTab === 'deactivated_members' && (
      <section className="wire-card">
        <p className="eyebrow strong">Deactivated Members</p>
        {deactivatedMembers.length === 0 && <p>No deactivated members.</p>}
        {deactivatedMembers.map(m => (
          <div className="queue-row" key={m.id}>
            <div><strong>{m.fullName}</strong><p>{m.phoneNumber} ({m.groupName || 'No group'})</p></div>
            <div className="right">
              <button onClick={() => handleReactivate(m.id)}>Reactivate</button>
            </div>
          </div>
        ))}
      </section>
    )}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
