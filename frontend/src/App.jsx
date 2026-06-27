import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, getUser, clearSession } from './api.js';
import { printLabelHTML } from './label.js';
import Login from './Login.jsx';
import Avatar from './Avatar.jsx';
import Todos from './Todos.jsx';

const CARTON_TYPES = ['Petit', 'Moyen', 'Grand', 'Palette'];
const ORDER_TYPES = ['Zone 53', 'Proforma'];

const emptyForm = {
  type: 'Zone 53',
  orderNumber: '',
  client: '',
  cartonType: 'Moyen',
  cartonCount: 1,
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
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState({ key: 'created_at', dir: 'desc' });
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [avatars, setAvatars] = useState({});
  const [detailOrder, setDetailOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('orders');

  const isAtelier = user?.role === 'atelier';
  const isAdmin = user?.role === 'admin';

  useEffect(() => { if (user) { refresh(); refreshAvatars(); } }, [user]);
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

  async function refreshAvatars() {
    try {
      const { avatars } = await api.getAvatars();
      setAvatars(avatars || {});
    } catch (err) {
      // pas bloquant : on garde le fallback initiales
      console.warn('avatars fetch failed', err);
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
          type: order.order_type,
          client: order.client,
          orderNumber: order.order_number,
          createdBy: order.created_by,
          createdAt: order.created_at,
          note: order.note,
          cartonCount: order.carton_count || 1,
        });
      }
      setForm({ ...emptyForm, type: form.type });
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter(o => {
      const matchSearch = !q ||
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.client || '').toLowerCase().includes(q) ||
        (o.created_by || '').toLowerCase().includes(q);
      const matchType = !typeFilter || o.order_type === typeFilter;
      const matchDate = !dateFilter || (o.created_at || '').startsWith(dateFilter);
      return matchSearch && matchType && matchDate;
    });
    list.sort((a, b) => {
      const av = a[sortBy.key] ?? '';
      const bv = b[sortBy.key] ?? '';
      const cmp = String(av).localeCompare(String(bv));
      return sortBy.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [orders, search, typeFilter, dateFilter, sortBy]);

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
        <h1>Logistique Zone 53</h1>
        <div className="actions">
          {isAdmin && (
            <>
              <button onClick={exportToXlsx}>Exporter Excel</button>
              <button onClick={exportToCsv}>Exporter CSV</button>
              <button onClick={() => setShowAdmin(true)}>Utilisateurs</button>
            </>
          )}
          <span className="user-pill">
            <Avatar
              name={user.displayName}
              avatar={avatars[user.displayName]}
              size={24}
            />
            <span>{user.displayName} <em>({user.role})</em></span>
          </span>
          <button className="ghost" onClick={logout}>Déconnexion</button>
        </div>
      </header>

      {user && (
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >Commandes</button>
          <button
            className={`tab ${activeTab === 'todos' ? 'active' : ''}`}
            onClick={() => setActiveTab('todos')}
          >Todos</button>
        </nav>
      )}

      <main className={isAtelier || activeTab === 'todos' ? 'view-atelier' : ''}>
        {activeTab === 'todos' && (
          <Todos avatars={avatars} />
        )}

        {activeTab === 'orders' && !isAtelier && (
        <section className="form">
          <h2>Nouvelle commande</h2>
          <form onSubmit={addOrder}>
            <div className="type-selector full">
              <span className="label-small">Type</span>
              <div className="type-buttons">
                {ORDER_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`type-btn ${form.type === t ? 'active' : ''}`}
                    onClick={() => update('type', t)}
                  >{t}</button>
                ))}
              </div>
            </div>

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
            <label>Type carton
              <select value={form.cartonType}
                onChange={e => update('cartonType', e.target.value)}>
                {CARTON_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Nombre de cartons
              <input type="number" min="1" max="99"
                value={form.cartonCount}
                onChange={e => update('cartonCount', e.target.value)} />
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
        )}

        {activeTab === 'orders' && (
        <section className="history">
          <div className="filters">
            <input
              placeholder="Rechercher (commande, client, utilisateur)…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Tous types</option>
              {ORDER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="date" value={dateFilter}
              onChange={e => setDateFilter(e.target.value)} />
            <span className="count">{filtered.length} / {orders.length}</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="th-detail" aria-label="Détails"></th>
                  {[
                    ['created_at', 'Date'],
                    ['order_type', 'Type'],
                    ['order_number', 'Commande'],
                    ['client', 'Client'],
                    ['carton_type', 'Carton'],
                    ['carton_count', 'Nb'],
                  ].map(([k, label]) => (
                    <th key={k} onClick={() => toggleSort(k)}>
                      {label} {sortBy.key === k ? (sortBy.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td className="td-detail">
                      <button
                        type="button"
                        className="btn-detail"
                        title="Détails de la commande"
                        onClick={() => setDetailOrder(o)}
                      >!</button>
                    </td>
                    <td>{formatDate(o.created_at)}</td>
                    <td>
                      <span className={`type-badge type-${(o.order_type || '').replace(/\s+/g, '').toLowerCase()}`}>
                        {o.order_type || 'Zone 53'}
                      </span>
                    </td>
                    <td><b>{o.order_number}</b></td>
                    <td>{o.client}</td>
                    <td>{o.carton_type}</td>
                    <td><b>{o.carton_count || 1}</b></td>
                    <td className="note">
                      {editingNoteId === o.id ? (
                        <>
                          <textarea rows="2" value={editingNoteValue}
                            onChange={e => setEditingNoteValue(e.target.value)} />
                          <button onClick={() => saveNote(o.id)}>OK</button>
                        </>
                      ) : isAtelier ? (
                        <span className="note-readonly">
                          {o.note || <i>—</i>}
                        </span>
                      ) : (
                        <span onClick={() => {
                          setEditingNoteId(o.id);
                          setEditingNoteValue(o.note || '');
                        }}>
                          {o.note || <i>—</i>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="8" className="empty">Aucune commande</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {showAdmin && (
          <AdminPanel
            currentUserId={user.id}
            onClose={() => setShowAdmin(false)}
            onUsersChanged={refreshAvatars}
          />
        )}

        {detailOrder && (
          <OrderDetailModal
            order={detailOrder}
            avatars={avatars}
            onClose={() => setDetailOrder(null)}
          />
        )}
      </main>
    </div>
  );
}

const emptyUserForm = {
  username: '', password: '', displayName: '', role: 'user', avatar: null,
};

const AVATAR_SIZE = 128;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB en entrée — sera redimensionné

async function fileToAvatarDataURL(file) {
  if (!file.type.startsWith('image/')) throw new Error('Le fichier doit être une image');
  if (file.size > MAX_FILE_BYTES) throw new Error('Image trop lourde (max 5 MB)');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Image invalide'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    // crop "cover" centré
    const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AdminPanel({ onClose, currentUserId, onUsersChanged }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyUserForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { users } = await api.listUsers();
      setUsers(users);
    } catch (e) { setError(e.message); }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: '',
      displayName: u.display_name,
      role: u.role,
      avatar: u.avatar || null,
    });
    setError('');
    document.querySelector('.user-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset input pour permettre re-upload
    if (!file) return;
    setError('');
    try {
      const dataUrl = await fileToAvatarDataURL(file);
      setForm(f => ({ ...f, avatar: dataUrl }));
    } catch (err) {
      setError(err.message);
    }
  }

  function clearAvatar() {
    setForm(f => ({ ...f, avatar: null }));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyUserForm);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (editingId) {
        const payload = {
          username: form.username,
          displayName: form.displayName,
          role: form.role,
          avatar: form.avatar, // null = suppression, dataURL = nouvelle photo
        };
        if (form.password) payload.password = form.password;
        await api.updateUser(editingId, payload);
      } else {
        if (!form.username || !form.password || !form.displayName) {
          throw new Error('Tous les champs sont obligatoires pour un nouveau compte');
        }
        await api.createUser(form);
      }
      cancelEdit();
      await load();
      onUsersChanged?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(u) {
    if (!confirm(`Supprimer définitivement ${u.username} ?`)) return;
    try {
      await api.deleteUser(u.id);
      if (editingId === u.id) cancelEdit();
      await load();
      onUsersChanged?.();
    } catch (e) { alert(e.message); }
  }

  const isEdit = !!editingId;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Gestion des utilisateurs</h3>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </header>

        <div className="user-form-card">
          <div className="user-form-title">
            {isEdit
              ? <>✏️ Modification — <b>{users.find(u => u.id === editingId)?.username}</b></>
              : <>➕ Nouveau compte</>}
          </div>

          <form onSubmit={submit} className="user-form-grid">
            <div className="avatar-field full">
              <span>Avatar</span>
              <div className="avatar-uploader">
                <Avatar
                  name={form.displayName || form.username || '?'}
                  avatar={form.avatar}
                  size={72}
                />
                <div className="avatar-uploader-actions">
                  <label className="btn ghost avatar-btn">
                    {form.avatar ? 'Remplacer la photo' : 'Choisir une photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                      hidden
                    />
                  </label>
                  {form.avatar && (
                    <button type="button" className="ghost" onClick={clearAvatar}>
                      Retirer
                    </button>
                  )}
                  <small className="avatar-hint">
                    Recommandé : carrée. Recadrée et redimensionnée en 128×128 automatiquement.
                  </small>
                </div>
              </div>
            </div>

            <label>
              <span>Login</span>
              <input
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                disabled={isEdit && editingId === currentUserId}
                placeholder="login"
              />
            </label>
            <label>
              <span>Nom complet</span>
              <input
                value={form.displayName}
                onChange={e => setForm({ ...form, displayName: e.target.value })}
                placeholder="Prénom Nom"
              />
            </label>
            <label>
              <span>Rôle</span>
              <select
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
                disabled={isEdit && editingId === currentUserId}
              >
                <option value="user">Utilisateur</option>
                <option value="admin">Admin</option>
                <option value="atelier">Atelier (lecture seule)</option>
              </select>
            </label>
            <label>
              <span>{isEdit ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}</span>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={isEdit ? '(laisser vide pour ne pas changer)' : 'min 6 caractères'}
              />
            </label>

            {error && <div className="error full">{error}</div>}

            <div className="user-form-actions full">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? '…' : isEdit ? 'Enregistrer les modifications' : 'Créer le compte'}
              </button>
              {isEdit && (
                <button type="button" className="ghost" onClick={cancelEdit}>
                  Annuler
                </button>
              )}
            </div>
          </form>
        </div>

        <h4 className="users-list-title">Comptes existants ({users.length})</h4>
        <table className="users-table">
          <thead>
            <tr>
              <th></th>
              <th>Login</th>
              <th>Nom complet</th>
              <th>Rôle</th>
              <th>Créé le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={editingId === u.id ? 'editing' : ''}>
                <td><Avatar name={u.display_name} avatar={u.avatar} size={32} /></td>
                <td><b>{u.username}</b>{u.id === currentUserId && <span className="self-tag">vous</span>}</td>
                <td>{u.display_name}</td>
                <td>
                  <span className={`role-badge role-${u.role}`}>
                    {u.role}
                  </span>
                </td>
                <td>{formatDate(u.created_at)}</td>
                <td className="row-actions">
                  <button onClick={() => startEdit(u)}>Modifier</button>
                  {u.id !== currentUserId && (
                    <button className="danger" onClick={() => remove(u)}>Supprimer</button>
                  )}
                </td>
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

const FIELD_LABELS = {
  note: 'Note',
  carton_type: 'Type carton',
  carton_count: 'Nombre cartons',
  client: 'Client',
  order_number: 'N° commande',
  order_type: 'Type',
};

function OrderDetailModal({ order, avatars, onClose }) {
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    setHistoryLoading(true);
    api.orderHistory(order.id)
      .then(({ history }) => setHistory(history || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [order.id]);

  const labelPayload = {
    type: order.order_type,
    client: order.client,
    orderNumber: order.order_number,
    createdBy: order.created_by,
    createdAt: order.created_at,
    note: order.note,
    cartonCount: order.carton_count || 1,
  };

  function doPrint() { printLabelHTML(labelPayload); }

  const typeClass = `type-${(order.order_type || '').replace(/\s+/g, '').toLowerCase()}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-detail" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Détails de la commande</h3>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </header>

        <div className="detail-body">
          <div className="detail-creator">
            <Avatar
              name={order.created_by}
              avatar={avatars[order.created_by]}
              size={64}
            />
            <div className="detail-creator-info">
              <div className="detail-creator-name">{order.created_by}</div>
              <div className="detail-creator-meta">
                Créé le <b>{formatDate(order.created_at)}</b>
              </div>
              {order.updated_at && (
                <div className="detail-creator-meta">
                  Modifié le {formatDate(order.updated_at)} par <b>{order.updated_by}</b>
                </div>
              )}
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value">
                <span className={`type-badge ${typeClass}`}>{order.order_type || 'Zone 53'}</span>
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">N° commande</span>
              <span className="detail-value"><b>{order.order_number}</b></span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Client</span>
              <span className="detail-value">{order.client}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Carton</span>
              <span className="detail-value">
                {order.carton_type || '—'} <span className="detail-mult">×</span> <b>{order.carton_count || 1}</b>
              </span>
            </div>
            <div className="detail-row detail-row-full">
              <span className="detail-label">Note</span>
              <span className="detail-value">{order.note || <i className="muted">—</i>}</span>
            </div>
          </div>

          <div className="detail-history">
            <h4>Historique des modifications</h4>
            {historyLoading ? (
              <p className="empty">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="empty">Aucune modification enregistrée</p>
            ) : (
              <ul className="history-list">
                {history.map(h => (
                  <li key={h.id}>
                    <div className="history-line">
                      <Avatar name={h.changed_by} avatar={avatars[h.changed_by]} size={22} />
                      <div className="history-text">
                        <b>{h.changed_by}</b> a modifié{' '}
                        <code>{FIELD_LABELS[h.field] || h.field}</code>
                        <div className="history-diff">
                          <span className="history-old">{h.old_value || '∅'}</span>
                          <span className="history-arrow">→</span>
                          <span className="history-new">{h.new_value || '∅'}</span>
                        </div>
                      </div>
                      <span className="history-time">{formatDate(h.changed_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        <footer className="detail-footer">
          <button className="primary" onClick={doPrint}>Imprimer l'étiquette</button>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </footer>
      </div>
    </div>
  );
}
