import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const demoMembers = [
  { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', groupId: 'group-001', fullName: 'John Doe', phoneNumber: '+254700000001', email: 'john@example.com', role: 'MEMBER', accountBalance: '45000.00' },
  { id: '9f8c2f48-21e6-4d24-9be5-7d877160fabc', groupId: 'group-001', fullName: 'Jane Smith', phoneNumber: '+254700000002', email: 'jane@example.com', role: 'MEMBER', accountBalance: '30000.00' },
  { id: '2dc57f94-02da-46da-b710-f0b617c2ed71', groupId: 'group-001', fullName: 'Peter Mwangi', phoneNumber: '+254700000003', email: 'peter@example.com', role: 'MEMBER', accountBalance: '18000.00' },
  { id: 'a7597f71-9243-47bd-8dc2-51d938c7db61', groupId: 'group-001', fullName: 'Alice Wanjiku', phoneNumber: '+254700000004', email: 'alice@example.com', role: 'TREASURER', accountBalance: '62000.00' }
];

const demoTransactions = [
  { id: 'tx-001', memberId: demoMembers[0].id, groupId: 'group-001', amount: '5000.00', transactionType: 'CONTRIBUTION', description: 'Contribution', timestamp: '2026-06-05T09:00:00.000Z' },
  { id: 'tx-002', memberId: demoMembers[1].id, groupId: 'group-001', amount: '15000.00', transactionType: 'LOAN_DISBURSEMENT', description: 'Loan Approved', timestamp: '2026-06-07T12:30:00.000Z' },
  { id: 'tx-003', memberId: demoMembers[2].id, groupId: 'group-001', amount: '3000.00', transactionType: 'CONTRIBUTION', description: 'Contribution', timestamp: '2026-06-12T14:15:00.000Z' }
];

const demoLoans = [
  { id: '6e5bd9c4-4317-4f21-8f7f-22e8e7f448d6', memberId: demoMembers[0].id, groupId: 'group-001', principalAmount: '10000.00', interestRate: '0.1000', totalRepayable: '11000.00', amountPaid: '1000.00', dueDate: '2026-07-15', status: 'ACTIVE', approvedBy: demoMembers[3].id },
  { id: '74f6ef39-3b91-45ab-b3e3-d08eb9a17fc1', memberId: demoMembers[1].id, groupId: 'group-001', principalAmount: '20000.00', interestRate: '0.1000', totalRepayable: '22000.00', amountPaid: '0.00', dueDate: '2026-08-01', status: 'PENDING', approvedBy: null },
  { id: '1de4991b-9125-4c91-b664-aea1f0f14d8e', memberId: demoMembers[2].id, groupId: 'group-001', principalAmount: '8000.00', interestRate: '0.1000', totalRepayable: '8800.00', amountPaid: '0.00', dueDate: '2026-07-10', status: 'PENDING', approvedBy: null }
];

function money(value) {
  return 'KSH ' + Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toISOString().slice(0, 10);
}

function getMemberName(members, id) {
  const member = members.find((item) => item.id === id);
  return member ? member.fullName : 'Unknown Member';
}

async function apiFetch(path, options) {
  const settings = options || {};
  const headers = { 'Content-Type': 'application/json' };
  if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
  const response = await fetch(API_BASE_URL + path, {
    method: settings.method || 'GET',
    headers,
    body: settings.body ? JSON.stringify(settings.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Request failed');
  return payload.data === undefined ? payload : payload.data;
}

function App() {
  const [screen, setScreen] = useState('login');
  const [language, setLanguage] = useState('ENG');
  const [role, setRole] = useState('MEMBER');
  const [token, setToken] = useState(localStorage.getItem('chamaToken') || '');
  const [members, setMembers] = useState(demoMembers);
  const [transactions, setTransactions] = useState(demoTransactions);
  const [loans, setLoans] = useState(demoLoans);
  const [currentMemberId, setCurrentMemberId] = useState(demoMembers[0].id);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const currentMember = members.find((member) => member.id === currentMemberId) || members[0];
  const navItems = useMemo(() => [
    { id: 'member', label: 'Dashboard', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'ledger', label: 'Ledger', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'requestLoan', label: 'Request Loan', roles: ['MEMBER', 'TREASURER', 'ADMIN'] },
    { id: 'admin', label: 'Admin', roles: ['TREASURER', 'ADMIN'] },
    { id: 'members', label: 'Members', roles: ['TREASURER', 'ADMIN'] },
    { id: 'sms', label: 'SMS', roles: ['TREASURER', 'ADMIN'] }
  ], []);

  async function refreshData() {
    if (!token) {
      setNotice('Demo mode: paste a Firebase idToken on login to use live backend data.');
      return;
    }
    setLoading(true);
    try {
      const liveMembers = await apiFetch('/api/members', { token });
      const liveTransactions = await apiFetch('/api/transactions', { token });
      setMembers(liveMembers.length ? liveMembers : demoMembers);
      setTransactions(liveTransactions.length ? liveTransactions : demoTransactions);
      setCurrentMemberId(liveMembers[0]?.id || currentMemberId);
      setNotice('Live backend data loaded.');
    } catch (error) {
      setNotice(error.message + '. Showing demo data.');
    } finally {
      setLoading(false);
    }
  }

  function login() {
    if (token) localStorage.setItem('chamaToken', token);
    setScreen(role === 'MEMBER' ? 'member' : 'admin');
    setNotice(role === 'MEMBER' ? 'Member demo session ready.' : 'Admin/Treasurer demo session ready.');
    refreshData();
  }

  async function recordContribution(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { memberId: data.memberId, amount: data.amount, description: data.description || 'Member contribution payment' };
    if (token) {
      await apiFetch('/api/transactions/contributions', { token, method: 'POST', body });
      await refreshData();
      return 'Contribution recorded and backend sync requested.';
    }
    const target = members.find((member) => member.id === body.memberId);
    setMembers((items) => items.map((member) => member.id === body.memberId ? { ...member, accountBalance: (Number(member.accountBalance) + Number(body.amount)).toFixed(2) } : member));
    setTransactions((items) => [{ id: 'demo-' + Date.now(), memberId: body.memberId, groupId: target?.groupId || 'group-001', amount: Number(body.amount).toFixed(2), transactionType: 'CONTRIBUTION', description: body.description, timestamp: new Date().toISOString() }, ...items]);
    return 'Contribution recorded in demo mode.';
  }

  async function requestLoan(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { memberId: data.memberId, groupId: currentMember.groupId, principalAmount: data.principalAmount, interestRate: data.interestRate, dueDate: data.dueDate, description: data.description };
    if (token) {
      const loan = await apiFetch('/api/loans/request', { token, method: 'POST', body });
      setLoans((items) => [loan, ...items]);
      return 'Loan request submitted.';
    }
    const principal = Number(body.principalAmount);
    const total = principal + principal * Number(body.interestRate);
    setLoans((items) => [{ id: crypto.randomUUID(), ...body, totalRepayable: total.toFixed(2), amountPaid: '0.00', status: 'PENDING', approvedBy: null }, ...items]);
    return 'Loan request added in demo mode.';
  }

  async function approveLoan(loanId) {
    if (token) await apiFetch('/api/loans/' + loanId + '/approve', { token, method: 'PATCH' });
    setLoans((items) => items.map((loan) => loan.id === loanId ? { ...loan, status: 'ACTIVE', approvedBy: currentMember.id } : loan));
    setNotice('Loan approved.');
  }

  async function recordRepayment(form) {
    const data = Object.fromEntries(new FormData(form));
    if (token) {
      await apiFetch('/api/loans/' + data.loanId + '/repay', { token, method: 'POST', body: { amount: data.amount, description: data.description } });
      return 'Repayment recorded.';
    }
    setLoans((items) => items.map((loan) => loan.id === data.loanId ? { ...loan, amountPaid: (Number(loan.amountPaid) + Number(data.amount)).toFixed(2) } : loan));
    return 'Repayment recorded in demo mode.';
  }

  async function addMember(form) {
    const data = Object.fromEntries(new FormData(form));
    const body = { groupId: 'group-001', fullName: data.fullName, phoneNumber: data.phoneNumber, email: data.email, role: data.role, accountBalance: data.accountBalance || '0.00' };
    if (token) {
      const member = await apiFetch('/api/members', { token, method: 'POST', body });
      setMembers((items) => [member, ...items]);
      return 'Member created.';
    }
    setMembers((items) => [{ id: crypto.randomUUID(), ...body }, ...items]);
    return 'Member added in demo mode.';
  }

  async function sendSms(form) {
    const data = Object.fromEntries(new FormData(form));
    if (token) {
      await apiFetch('/api/notifications/sms/test', { token, method: 'POST', body: data });
      return 'SMS test submitted.';
    }
    return 'SMS preview queued in demo mode.';
  }

  const pendingLoans = loans.filter((loan) => loan.status === 'PENDING');
  const memberLoans = loans.filter((loan) => loan.memberId === currentMember.id);
  const memberTransactions = transactions.filter((tx) => tx.memberId === currentMember.id);

  return <main className="shell"><section className="phone-frame">
    {screen === 'login' ? <LoginScreen language={language} setLanguage={setLanguage} role={role} setRole={setRole} token={token} setToken={setToken} login={login} /> : <>
      <TopBar screen={screen} role={role} setRole={setRole} setScreen={setScreen} currentMember={currentMember} loading={loading} />
      <nav className="tabs">{navItems.filter((item) => item.roles.includes(role)).map((item) => <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => setScreen(item.id)}>{item.label}</button>)}</nav>
      {notice && <div className="notice">{notice}</div>}
      {screen === 'member' && <MemberDashboard member={currentMember} members={members} setCurrentMemberId={setCurrentMemberId} transactions={memberTransactions} allTransactions={transactions} loans={memberLoans} />}
      {screen === 'admin' && <AdminPanel members={members} pendingLoans={pendingLoans} approveLoan={approveLoan} go={setScreen} />}
      {screen === 'recordContribution' && <FormScreen title="Record Contribution" onBack={() => setScreen('admin')} onSubmit={recordContribution} successText="Confirmation message will appear here"><MemberSelect members={members} /><label>Contribution Amount (KSH)<input name="amount" inputMode="decimal" defaultValue="5000" /></label><label>Date<input name="date" defaultValue="05/06/2026" /></label><label>Description<input name="description" defaultValue="Monthly contribution" /></label></FormScreen>}
      {screen === 'requestLoan' && <FormScreen title="Request Loan" onBack={() => setScreen('member')} onSubmit={requestLoan} successText="Loan request status will appear here"><MemberSelect members={members} currentMemberId={currentMember.id} /><label>Principal Amount (KSH)<input name="principalAmount" defaultValue="10000" /></label><label>Interest Rate<input name="interestRate" defaultValue="0.10" /></label><label>Due Date<input name="dueDate" type="date" defaultValue="2026-07-15" /></label><label>Description<input name="description" defaultValue="Emergency loan request" /></label></FormScreen>}
      {screen === 'repayment' && <RepaymentScreen loans={loans} members={members} onSubmit={recordRepayment} onBack={() => setScreen('admin')} />}
      {screen === 'members' && <MembersScreen members={members} addMember={addMember} />}
      {screen === 'ledger' && <LedgerScreen members={members} transactions={transactions} loans={loans} />}
      {screen === 'sms' && <SmsScreen members={members} sendSms={sendSms} />}
    </>}
  </section></main>;
}

function LoginScreen({ language, setLanguage, role, setRole, token, setToken, login }) {
  return <div className="login-screen">
    <div className="language-row"><button className={language === 'ENG' ? 'solid' : ''} onClick={() => setLanguage('ENG')}>ENG</button><button className={language === 'SWA' ? 'solid' : ''} onClick={() => setLanguage('SWA')}>SWA</button></div>
    <section className="brand-box"><div className="brand-mark">CH</div><p>CHAMA HUB</p></section>
    <label>Phone Number<input placeholder="+254 000 000 000" /></label>
    <label>Firebase idToken<input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Optional for live backend access" /></label>
    <label>4-Digit Verification Code<div className="code-row"><input maxLength="1" /><input maxLength="1" /><input maxLength="1" /><input maxLength="1" /></div></label>
    <div className="role-box"><p>Demo: Select User Role</p><button className={role === 'MEMBER' ? 'solid' : ''} onClick={() => setRole('MEMBER')}>Member</button><button className={role !== 'MEMBER' ? 'solid' : ''} onClick={() => setRole('TREASURER')}>Admin/Treasurer</button></div>
    <button className="primary bottom-action" onClick={login}>Verify & Login</button>
  </div>;
}

function TopBar({ screen, role, setRole, setScreen, currentMember, loading }) {
  const titles = { member: 'Chama System', admin: 'Admin Panel', recordContribution: 'Record Contribution', requestLoan: 'Request Loan', repayment: 'Record Repayment', members: 'Members', ledger: 'Shared Ledger', sms: 'SMS Test' };
  return <header className="topbar">{screen !== 'member' && <button className="icon-button" onClick={() => setScreen(role === 'MEMBER' ? 'member' : 'admin')}>{'<-'}</button>}<strong>{titles[screen] || 'Chama System'}</strong><div className="top-actions">{loading && <span className="tiny">Sync</span>}<select value={role} onChange={(event) => setRole(event.target.value)}><option value="MEMBER">Member</option><option value="TREASURER">Treasurer</option><option value="ADMIN">Admin</option></select><span className="avatar">{currentMember.fullName.slice(0, 1)}</span></div></header>;
}

function MemberDashboard({ member, members, setCurrentMemberId, transactions, allTransactions, loans }) {
  const activeLoan = loans.find((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status));
  const totalContributions = transactions.filter((tx) => tx.transactionType === 'CONTRIBUTION').reduce((sum, tx) => sum + Number(tx.amount), 0);
  return <div className="screen-stack"><select className="member-switcher" value={member.id} onChange={(event) => setCurrentMemberId(event.target.value)}>{members.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select><section className="wire-card"><p className="eyebrow">Personal Balance</p><h1>{money(member.accountBalance)}</h1><div className="line" /><p>Total Contributions: {money(totalContributions)}</p></section><section className="wire-card two-col"><div><p className="eyebrow">Outstanding Loans</p><strong>{activeLoan ? activeLoan.status : 'None'}</strong><p>Due Date</p></div><div className="right"><p>{activeLoan ? money(Number(activeLoan.totalRepayable) - Number(activeLoan.amountPaid)) : 'KSH 0'}</p><p>{activeLoan ? activeLoan.dueDate : '-'}</p></div></section><section className="wire-card"><p className="eyebrow strong">Shared Ledger Activity</p>{allTransactions.slice(0, 5).map((tx) => <LedgerRow key={tx.id} name={getMemberName(members, tx.memberId)} type={tx.transactionType} amount={tx.amount} />)}</section></div>;
}

function AdminPanel({ members, pendingLoans, approveLoan, go }) {
  return <div className="screen-stack"><div className="clearance">Treasurer Clearance Active</div><div className="action-grid"><ActionTile icon="+" label="Record Contribution" onClick={() => go('recordContribution')} /><ActionTile icon="/" label="Approve Loan" onClick={() => go('ledger')} /><ActionTile icon="!" label="Trigger Penalty Sweep" onClick={() => go('ledger')} /><ActionTile icon="=" label="Compile Financial Report" onClick={() => go('ledger')} /><ActionTile icon="R" label="Record Repayment" onClick={() => go('repayment')} /><ActionTile icon="S" label="Test SMS" onClick={() => go('sms')} /></div><section className="wire-card"><p className="eyebrow strong">Pending Approvals Queue</p>{pendingLoans.length === 0 && <p>No pending loan approvals.</p>}{pendingLoans.map((loan) => <div className="queue-row" key={loan.id}><div><strong>{getMemberName(members, loan.memberId)}</strong><p>Loan Request</p></div><div className="right"><p>{money(loan.principalAmount)}</p><button onClick={() => approveLoan(loan.id)}>Review</button></div></div>)}</section></div>;
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
