export function createApp({ clearOnLogout = false, noStore = false } = {}) {
  let rowId = 0;
  let tokenId = 0;
  const db = { rows: [] };
  const cache = { queries: new Map(), http: new Map() };
  const counters = { apiCalls: 0, cacheHits: 0 };
  let session = null;

  function insertRows(n) {
    for (let i = 0; i < n; i++) db.rows.push({ id: ++rowId, amount: 100 + rowId });
  }

  const readDashboard = () => ({
    total: db.rows.reduce((sum, r) => sum + r.amount, 0),
    count: db.rows.length,
  });

  async function apiFetch(path) {
    if (!noStore && cache.http.has(path)) {
      counters.cacheHits++;
      return cache.http.get(path);
    }
    counters.apiCalls++;
    const body = readDashboard();
    if (!noStore) cache.http.set(path, body);
    return body;
  }

  async function login(user) {
    session = { user, token: `tok_${++tokenId}` };
    return session;
  }

  function logout() {
    session = null;
    // http cache simulates browser/SW storage: clearing app state cannot evict it.
    if (clearOnLogout) cache.queries.clear();
  }

  async function dashboard() {
    if (!session) throw new Error("no session");
    const key = `dashboard:${session.user}`;
    if (cache.queries.has(key)) return cache.queries.get(key);
    const data = await apiFetch("/dashboard");
    cache.queries.set(key, data);
    return data;
  }

  return { insertRows, login, logout, dashboard, readDashboard, counters };
}
