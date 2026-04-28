import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, getUser, clearSession } from './api.js';
import { buildZPL, printLabelHTML } from './label.js';
import Login from './Login.jsx';

const CARTON_TYPES = ['Petit', 'Moyen', 'Grand', 'Palette'];

const emptyForm = {
  orderNumber: '',
  client: '',
  cartonType: 'Moyen',
  note: '',
};

const AUTO_PRINT_KEY = 'zone53_autoprint';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [autoPrint, setAutoPrint] = useState(
    localStorage.getItem(AUTO_PRINT_KEY) !== 'false'
  );
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState({ key: 'created_at', dir: 'desc' });
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [zplPreview, setZplPreview] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => { if (user) refresh(); }, [user]);
  useEffect(() => {
    localStorage.setItem(AUTO_PRINT_KEY, autoPrint ? 'true' : 'false');
  }, [autoPrint]);

  async function refresh() {
    try {
      const { orders } = await api.listOrders();
      setOrders(orders);
    } catch (err) {
      alert(err.message);
    }
  }

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function addOrder(e) {
    e.preventDefault();
    if (!form.orderNumber || !form.client) {
      alert('N° commande et Client sont obligatoires');
      return;
    }
    try {
      const { order } = await api.createOrder(form);
      if (autoPrint) {
        printLabelHTML({
          client: order.client,
          orderNumber: order.order_number,
          createdBy: order.created_by,
          createdAt: order.created_at,
        });
      }
      setForm({ ...emptyForm });
      await refresh();
      document.querySelector('input[name=orderNumber]')?.focus();
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveNote(id) {
    try {
      await api.updateOrder(id, { note: editingNoteValue });
      setEditingNoteId(null);
      setEditingNoteValue('');
      await refresh();
    } catch (err) { alert(err.message); }
  }

  function exportToXlsx() {
    const ws = XLSX.utils.json_to_sheet(orders);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historique');
    XLSX.writeFile(wb, `zone53_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function exportToCsv() {
    const ws = XLSX.utils.json_to_sheet(orders);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zone53_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  function generateLabel(o) {
    setZplPreview(buildZPL({
      client: o.client,
      orderNumber: o.order_number,
      createdBy: o.created_by,
      createdAt: o.created_at,
    }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter(o => {
      const matchSearch = !q ||
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.client || '').toLowerCase().includes(q) ||
        (o.created_by || '').toLowerCase().includes(q);
      const matchDate = !dateFilter || (o.created_at || '').startsWith(dateFilter);
      return matchSearch && matchDate;
    });
    list.sort((a, b) => {
      const av = a[sortBy.key] ?? '';
      const bv = b[sortBy.key] ?? '';
      const cmp = String(av).localeCompare(String(bv));
      return sortBy.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [orders, search, dateFilter, sortBy]);

  function toggleSort(key) {
    setSortBy(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header>
        <h1>Traçabilité Zone 53</h1>
        <div className="actions">
          {user.role === 'admin' && (
            <>
              <button onClick={exportToXlsx}>Exporter Excel</button>
              <button onClick={exportToCsv}>Exporter CSV</button>
              <button onClick={() => setShowAdmin(true)}>Utilisateurs</button>
            </>
          )}
          <span className="user-pill">{user.displayName} ({user.role})</span>
          <button className="ghost" onClick={logout}>Déconnexion</button>
        </div>
      </header>

      <main>
        <section className="form">
          <h2>Nouvelle commande</h2>
          <form onSubmit={addOrder}>
            <label className="full">N° commande *
              <input
                name="orderNumber"
                value={form.orderNumber}
                onChange={e => update('orderNumber', e.target.value)}
                autoFocus
              />
            </label>
            <label className="full">Client *
              <input
                value={form.client}
                onChange={e => update('client', e.target.value)}
              />
            </label>
            <label className="full">Type carton
              <select value={form.cartonType}
                onChange={e => update('cartonType', e.target.value)}>
                {CARTON_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="full">Note
              <textarea rows="2" value={form.note}
                onChange={e => update('note', e.target.value)} />
            </label>
            <label className="full inline-check">
              <input type="checkbox"
                checked={autoPrint}
                onChange={e => setAutoPrint(e.target.checked)} />
              Imprimer l'étiquette après ajout
            </label>
            <button className="primary full big" type="submit">
              Ajouter {autoPrint && '+ Imprimer'}
            </button>
          </form>
        </section>

        <section className="history">
          <div className="filters">
            <input
              placeholder="Rechercher (commande, client, utilisateur)…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <input type="date" value={dateFilter}
              onChange={e => setDateFilter(e.target.value)} />
            <span className="count">{filtered.length} / {orders.length}</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    ['created_at', 'Date'],
                    ['order_number', 'Commande'],
                    ['client', 'Client'],
                    ['carton_type', 'Carton'],
                    ['created_by', 'Créé par'],
                  ].map(([k, label]) => (
                    <th key={k} onClick={() => toggleSort(k)}>
                      {label} {sortBy.key === k ? (sortBy.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td>{formatDate(o.created_at)}</td>
                    <td><b>{o.order_number}</b></td>
                    <td>{o.client}</td>
                    <td>{o.carton_type}</td>
                    <td><span className="user-tag">{o.created_by}</span></td>
                    <td className="note">
                      {editingNoteId === o.id ? (
                        <>
                          <textarea rows="2" value={editingNoteValue}
                            onChange={e => setEditingNoteValue(e.target.value)} />
                          <button onClick={() => saveNote(o.id)}>OK</button>
                        </>
                      ) : (
                        <span onClick={() => {
                          setEditingNoteId(o.id);
                          setEditingNoteValue(o.note || '');
                        }}>
                          {o.note || <i>—</i>}
                        </span>
                      )}
                    </td>
                    <td className="row-actions">
                      <button onClick={() => printLabelHTML({
                        client: o.client,
                        orderNumber: o.order_number,
                        createdBy: o.created_by,
                        createdAt: o.created_at,
                      })}>Imprimer</button>
                      <button className="ghost" onClick={() => generateLabel(o)}>ZPL</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="7" className="empty">Aucune commande</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {zplPreview && (
          <section className="zpl">
            <h3>ZPL prêt à copier</h3>
            <textarea rows="8" readOnly value={zplPreview} />
            <div>
              <button onClick={() => navigator.clipboard.writeText(zplPreview)}>Copier</button>
              <button className="ghost" onClick={() => setZplPreview('')}>Fermer</button>
            </div>
          </section>
        )}

        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      </main>
    </div>
  );
}

function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    username: '', password: '', displayName: '', role: 'user',
  });
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    try { const { users } = await api.listUsers(); setUsers(users); }
    catch (e) { setError(e.message); }
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createUser(form);
      setForm({ username: '', password: '', displayName: '', role: 'user' });
      await load();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header>
          <h3>Utilisateurs</h3>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </header>
        <form className="user-form" onSubmit={create}>
          <input placeholder="Login" value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })} />
          <input placeholder="Mot de passe" type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
          <input placeholder="Nom complet" value={form.displayName}
            onChange={e => setForm({ ...form, displayName: e.target.value })} />
          <select value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="primary" type="submit">Créer</button>
        </form>
        {error && <div className="error">{error}</div>}
        <table>
          <thead>
            <tr><th>Login</th><th>Nom</th><th>Rôle</th><th>Créé</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.display_name}</td>
                <td>{u.role}</td>
                <td>{u.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('fr-FR');
}
