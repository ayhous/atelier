import { useState } from 'react';
import { api, setSession } from './api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token, user } = await api.login(username, password);
      setSession(token, user);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Zone 53</h1>
        <p className="muted">Connexion warehouse</p>
        <label>Utilisateur
          <input value={username} onChange={e => setUsername(e.target.value)} autoFocus />
        </label>
        <label>Mot de passe
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
