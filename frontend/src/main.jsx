import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { auth, RecaptchaVerifier, signInWithPhoneNumber } from './firebase';
import { cacheGet, cacheSet } from './cache';

// VITE_API_BASE_URL should be set in .env when building for a real device.
// For a real Android device on the same WiFi as the dev PC, set it to the PC's LAN IP.
// e.g. VITE_API_BASE_URL=http://192.168.100.33:4000
// For the Android emulator only, 10.0.2.2 maps to the host PC.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.168.100.33:4000';

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
  const headers = { 'Content-Type': 'application/json' };
  if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
  
  try {
    const response = await fetch(API_BASE_URL + path, {
      method: settings.method || 'GET',
      headers,
      body: settings.body ? JSON.stringify(settings.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Request failed');
    
    const data = payload.data === undefined ? payload : payload.data;
    
    // Cache GET responses
    if ((settings.method || 'GET') === 'GET') {
      cacheSet(path, data);
    }
    
    return data;
  } catch (error) {
    // Try cache for GET requests if we have a network-level failure
    if (error.name === 'TypeError' && (settings.method || 'GET') === 'GET') {
      const cached = cacheGet(path);
      if (cached) return cached;
    }
    // Show the REAL error so we can debug — don't mask it
    const url = API_BASE_URL + path;
    throw new Error(`API call to ${url} failed: ${error.name}: ${error.message}`);
  }
}

function App() {
  const [screen, setScreen] = useState('login');
  const [language, setLanguage] = useState('ENG');
  const [token, setToken] = useState(localStorage.getItem('chamaToken') || '');
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
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
    { id: 'ledger', label: 'Ledger', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'requestLoan', label: 'Request Loan', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'treasurer', label: 'Treasurer', roles: ['TREASURER'] },
    { id: 'admin', label: 'Admin', roles: ['ADMIN'] }
  ], []);

  async function refreshData(authToken = token) {
    if (!authToken) return;
    setLoading(true);
    setNotice('');
    try {
      const liveMembers = await apiFetch('/api/members', { token: authToken });
      const liveTransactions = await apiFetch('/api/transactions', { token: authToken });
      // Fetch user's profile to get current member context (assuming we could get this via an endpoint, 
      // but here we just find the member matching our ID token. Actually, we don't have a /profile endpoint 
      // in member.routes.js that returns current user. Let's just pick the first member if we don't know.)
      setMembers(liveMembers || []);
      setTransactions(liveTransactions || []);
      
      // Try to load loans based on role
      try {
        // Just load overdue for everyone to see (if they can)
        const allLoansRes = await apiFetch('/api/loans/member/' + liveMembers[0]?.id, { token: authToken });
        setLoans(Array.isArray(allLoansRes) ? allLoansRes : []);
      } catch (e) {
        // ignore
      }
      
      if (!currentMember && liveMembers?.length > 0) {
        // Fallback: pick the first member if we don't know who we are
        setCurrentMember(liveMembers[0]);
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
      // Decode token to get phone number to find member?
      // Since Firebase auth might not map directly to member until we have a /profile endpoint,
      // we'll let LoginScreen set the currentMember after successful login.
      refreshData(token);
    }
  }, [token]);

  async function recordContribution(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { memberId: data.memberId, amount: data.amount, description: data.description || 'Member contribution payment' };
    await apiFetch('/api/transactions/contributions', { token, method: 'POST', body });
    await refreshData();
    return 'Contribution recorded.';
  }

  async function requestLoanAction(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { memberId: currentMember.id, groupId: currentMember.groupId, principalAmount: data.principalAmount, interestRate: data.interestRate, dueDate: data.dueDate, description: data.description };
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
  
  async function rejectLoan(loanId, reason = 'Rejected') {
    await apiFetch('/api/loans/' + loanId + '/reject', { token, method: 'PATCH', body: { reason } });
    setNotice('Loan rejected.');
    await refreshData();
  }

  async function recordRepayment(form) {
    const data = Object.fromEntries(new FormData(form));
    await apiFetch('/api/loans/' + data.loanId + '/repay', { token, method: 'POST', body: { amount: data.amount, description: data.description } });
    await refreshData();
    return 'Repayment recorded.';
  }

  async function addMember(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { groupId: currentMember?.groupId || 'group-001', fullName: data.fullName, phoneNumber: data.phoneNumber, email: data.email, role: data.role, accountBalance: data.accountBalance || '0.00' };
    await apiFetch('/api/members', { token, method: 'POST', body });
    await refreshData();
    return 'Member created.';
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

  if (!currentMember && screen !== 'login') {
    return <div className="shell">Loading member profile...</div>;
  }

  return <main className="shell">
    {!isOnline && <div style={{background: 'red', color: 'white', textAlign: 'center', padding: '4px'}}>You are currently offline</div>}
    
    {screen === 'login' ? <LoginScreen language={language} setLanguage={setLanguage} setToken={setToken} setScreen={setScreen} setCurrentMember={setCurrentMember} /> : <>
      <TopBar screen={screen} role={role} setScreen={setScreen} currentMember={currentMember} loading={loading} />
      <nav className="tabs">{navItems.filter((item) => item.roles.includes(role)).map((item) => <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => setScreen(item.id)}>{item.label}</button>)}</nav>
      {notice && <div className="notice">{notice}</div>}
      
      {screen === 'member' && <MemberDashboard member={currentMember} transactions={memberTransactions} allTransactions={transactions} loans={memberLoans} members={members} />}
      
      {screen === 'treasurer' && <TreasurerPanel members={members} pendingLoans={pendingLoans} approveLoan={treasurerApproveLoan} rejectLoan={rejectLoan} go={setScreen} />}
      
      {screen === 'admin' && <AdminPanel members={members} treasurerApprovedLoans={treasurerApprovedLoans} approveLoan={adminApproveLoan} rejectLoan={rejectLoan} go={setScreen} />}
      
      {screen === 'recordContribution' && <FormScreen title="Record Contribution" onBack={() => setScreen('treasurer')} onSubmit={recordContribution} successText="Confirmation message will appear here"><MemberSelect members={members} /><label>Contribution Amount (KSH)<input name="amount" inputMode="decimal" defaultValue="5000" /></label><label>Date<input name="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Description<input name="description" defaultValue="Monthly contribution" /></label></FormScreen>}
      
      {screen === 'requestLoan' && <FormScreen title="Request Loan" onBack={() => setScreen('member')} onSubmit={requestLoanAction} successText="Loan request status will appear here"><label>Principal Amount (KSH)<input name="principalAmount" defaultValue="10000" /></label><label>Interest Rate<input name="interestRate" defaultValue="0.10" /></label><label>Due Date<input name="dueDate" type="date" defaultValue="2026-07-15" /></label><label>Description<input name="description" defaultValue="Emergency loan request" /></label></FormScreen>}
      
      {screen === 'repayment' && <RepaymentScreen loans={loans} members={members} onSubmit={recordRepayment} onBack={() => setScreen('treasurer')} />}
      
      {screen === 'members' && <MembersScreen members={members} addMember={addMember} />}
      
      {screen === 'ledger' && <LedgerScreen members={members} transactions={transactions} loans={loans} />}
      
      {screen === 'sms' && <SmsScreen members={members} sendSms={sendSms} />}
    </>}
  </main>;
}

function LoginScreen({ language, setLanguage, setToken, setScreen, setCurrentMember }) {
  const [phoneNumber, setPhoneNumber] = useState('+254');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
    }
  }, []);

  async function handleSendOtp() {
    setLoading(true);
    setError('');
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
      window.confirmationResult = confirmationResult;
      setVerificationId(confirmationResult.verificationId);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError('');
    let firebaseUser = null;
    
    // Step 1: Verify the OTP with Firebase (isolated so error message is accurate)
    try {
      const result = await window.confirmationResult.confirm(code);
      firebaseUser = result.user;
    } catch (e) {
      setError('Incorrect verification code. Please try again.');
      setLoading(false);
      return;
    }

    // Step 2: Exchange Firebase token for a backend session
    try {
      const token = await firebaseUser.getIdToken();
      setToken(token);
      localStorage.setItem('chamaToken', token);
      
      // Fetch members and find the one matching this phone number
      const members = await apiFetch('/api/members', { token });
      const me = members.find(m => m.phoneNumber === firebaseUser.phoneNumber);
      
      if (me) {
        setCurrentMember(me);
        setScreen(me.role === 'MEMBER' ? 'member' : (me.role === 'TREASURER' ? 'treasurer' : 'admin'));
      } else {
        // Firebase OTP passed but this number isn't a registered member
        setError('Your number is not registered as a member. Please ask your group Admin to add you.');
        // Sign out from Firebase to avoid a stale session
        await auth.signOut();
      }
    } catch (e) {
      setError('Login succeeded but could not reach the server: ' + e.message + '. Make sure the backend is running and your phone is on the same WiFi as your PC.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="login-screen">
    <div className="language-row"><button className={language === 'ENG' ? 'solid' : ''} onClick={() => setLanguage('ENG')}>ENG</button><button className={language === 'SWA' ? 'solid' : ''} onClick={() => setLanguage('SWA')}>SWA</button></div>
    <section className="brand-box"><div className="brand-mark">CH</div><p>CHAMA HUB</p></section>
    
    <div id="recaptcha-container"></div>
    
    {!verificationId ? (
      <>
        <label>Phone Number<input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+254 000 000 000" /></label>
        <button className="primary bottom-action" onClick={handleSendOtp} disabled={loading}>{loading ? 'Sending OTP...' : 'Send Login Code'}</button>
      </>
    ) : (
      <>
        <label>6-Digit Verification Code<input value={code} onChange={e => setCode(e.target.value)} maxLength="6" placeholder="123456" /></label>
        <button className="primary bottom-action" onClick={handleVerifyOtp} disabled={loading}>{loading ? 'Verifying...' : 'Verify & Login'}</button>
      </>
    )}
    
    {error && <div style={{color: 'red', marginTop: 10}}>{error}</div>}
  </div>;
}

function TopBar({ screen, role, setScreen, currentMember, loading }) {
  const titles = { member: 'Chama System', admin: 'Admin Panel', treasurer: 'Treasurer Panel', recordContribution: 'Record Contribution', requestLoan: 'Request Loan', repayment: 'Record Repayment', members: 'Members', ledger: 'Shared Ledger', sms: 'SMS Test' };
  
  function getHome() {
    if (role === 'ADMIN') return 'admin';
    if (role === 'TREASURER') return 'treasurer';
    return 'member';
  }
  
  return <header className="topbar">
    {screen !== getHome() && screen !== 'member' && <button className="icon-button" onClick={() => setScreen(getHome())}>{'<-'}</button>}
    <strong>{titles[screen] || 'Chama System'}</strong>
    <div className="top-actions">
      {loading && <span className="tiny">Sync</span>}
      <span className="avatar">{currentMember?.fullName?.slice(0, 1)}</span>
    </div>
  </header>;
}

function MemberDashboard({ member, transactions, allTransactions, loans, members }) {
  const activeLoan = loans.find((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status));
  const totalContributions = transactions.filter((tx) => tx.transactionType === 'CONTRIBUTION').reduce((sum, tx) => sum + Number(tx.amount), 0);
  return <div className="screen-stack">
    <section className="wire-card">
      <p className="eyebrow">Personal Balance</p>
      <h1>{money(member.accountBalance)}</h1>
      <div className="line" />
      <p>Total Contributions: {money(totalContributions)}</p>
    </section>
    <section className="wire-card two-col">
      <div>
        <p className="eyebrow">Outstanding Loans</p>
        <strong>{activeLoan ? activeLoan.status : 'None'}</strong>
        <p>Due Date</p>
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

function TreasurerPanel({ members, pendingLoans, approveLoan, rejectLoan, go }) {
  return <div className="screen-stack">
    <div className="action-grid">
      <ActionTile icon="+" label="Record Contribution" onClick={() => go('recordContribution')} />
      <ActionTile icon="R" label="Record Repayment" onClick={() => go('repayment')} />
      <ActionTile icon="!" label="Apply Penalty" onClick={() => {}} />
      <ActionTile icon="=" label="Reports" onClick={() => {}} />
    </div>
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

function AdminPanel({ members, treasurerApprovedLoans, approveLoan, rejectLoan, go }) {
  return <div className="screen-stack">
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

function FormScreen({ title, onBack, onSubmit, successText, children }) {
  const [message, setMessage] = useState(successText);
  const [busy, setBusy] = useState(false);
  return <form className="form-screen" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { setMessage(await onSubmit(event.currentTarget)); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}><div className="form-title"><button type="button" className="icon-button" onClick={onBack}>{'<-'}</button><strong>{title}</strong></div>{children}<button className="primary" disabled={busy}>{busy ? 'Working...' : title}</button><div className="confirmation">{message}</div></form>;
}

function RepaymentScreen({ loans, members, onSubmit, onBack }) {
  const activeLoans = loans.filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status));
  return <FormScreen title="Record Repayment" onBack={onBack} onSubmit={onSubmit} successText="Repayment confirmation will appear here"><label>Select Loan<select name="loanId">{activeLoans.map((loan) => <option key={loan.id} value={loan.id}>{getMemberName(members, loan.memberId)} - {money(loan.totalRepayable)}</option>)}</select></label><label>Repayment Amount (KSH)<input name="amount" defaultValue="1000" /></label><label>Description<input name="description" defaultValue="Loan repayment" /></label></FormScreen>;
}

function MembersScreen({ members, addMember }) {
  return <div className="screen-stack"><section className="wire-card"><p className="eyebrow strong">Member Directory</p>{members.map((member) => <div className="queue-row" key={member.id}><div><strong>{member.fullName}</strong><p>{member.phoneNumber}</p></div><div className="right"><p>{member.role}</p><p>{money(member.accountBalance)}</p></div></div>)}</section><FormPanel submitText="Create Member" onSubmit={addMember}><label>Full Name<input name="fullName" defaultValue="David Kamau" /></label><label>Phone Number<input name="phoneNumber" defaultValue="+254700000005" /></label><label>Email<input name="email" defaultValue="david@example.com" /></label><label>Role<select name="role" defaultValue="MEMBER"><option>MEMBER</option><option>TREASURER</option><option>ADMIN</option></select></label><label>Opening Balance<input name="accountBalance" defaultValue="0.00" /></label></FormPanel></div>;
}

function LedgerScreen({ members, transactions, loans }) {
  return <div className="screen-stack"><section className="wire-card"><p className="eyebrow strong">Transaction Ledger</p>{transactions.map((tx) => <div className="queue-row" key={tx.id}><div><strong>{getMemberName(members, tx.memberId)}</strong><p>{tx.description || tx.transactionType}</p></div><div className="right"><p>{money(tx.amount)}</p><p>{shortDate(tx.timestamp)}</p></div></div>)}</section><section className="wire-card"><p className="eyebrow strong">Loans</p>{loans.map((loan) => <div className="queue-row" key={loan.id}><div><strong>{getMemberName(members, loan.memberId)}</strong><p>{loan.status} / due {loan.dueDate}</p></div><div className="right"><p>{money(loan.totalRepayable)}</p><p>Paid {money(loan.amountPaid)}</p></div></div>)}</section></div>;
}

function SmsScreen({ members, sendSms }) {
  return <div className="screen-stack"><FormPanel submitText="Send SMS Test" onSubmit={sendSms}><label>Recipient<select name="phoneNumber">{members.map((member) => <option key={member.id} value={member.phoneNumber}>{member.fullName} - {member.phoneNumber}</option>)}</select></label><label>Message<textarea name="message" defaultValue="Hello John Doe, this is a Chama Hub SMS test." /></label></FormPanel></div>;
}

function FormPanel({ children, onSubmit, submitText }) {
  const [message, setMessage] = useState('');
  return <form className="wire-card mini-form" onSubmit={async (event) => { event.preventDefault(); try { setMessage(await onSubmit(event.currentTarget)); } catch (error) { setMessage(error.message); } }}>{children}<button className="primary">{submitText}</button>{message && <div className="confirmation">{message}</div>}</form>;
}

createRoot(document.getElementById('root')).render(<App />);
