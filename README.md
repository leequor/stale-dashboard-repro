# Stale dashboard after logout → login

Repro of the reported symptom: after logging out and back in, the dashboard shows the previous
session's data until you hard reload. Run `node --test` (no dependencies).

## What "hard reload fixes it" tells you

A hard reload wipes JavaScript module state and the in-memory query cache. So the stale data is
almost certainly held **client-side**, not in Postgres. Two distinct layers can hold it, and they
need different fixes — the tests here separate them:

| Test | Layer proven |
|---|---|
| `reproduces the reported bug` | client query/store cache keyed by user, never evicted on logout |
| `clearing the query cache alone still fails` | HTTP / service-worker response cache, which app code cannot evict |
| `both fixes together return fresh data` | logout must clear query cache **and** the API must say `no-store` |
| `the fix keeps caching working` | the fix is not "disable caching" — repeat reads in a live session still hit cache |

## Ten minutes to find which one is yours

1. DevTools → Network → tick **Disable cache**, log out and back in.
   - Bug disappears → it's the HTTP/service-worker layer (causes 3 and 4).
   - Bug persists → it's app state (causes 1, 2, 5).
2. Still in Network, watch whether a request to your dashboard endpoint fires after login.
   No request → the client answered from cache, the server is innocent.
   Request fires but body is old → server or Railway proxy is returning stale data (cause 6).
3. Application → Storage → Local Storage: look for `REACT_QUERY_OFFLINE_CACHE` or a persisted
   Redux/Zustand blob. Application → Service Workers: any registration?
4. Grep the logout handler. If it only clears the token and calls `navigate('/login')`, nothing is
   evicting cached queries — that is the bug.

## Fixes

Key queries by session, not user, and clear on logout:

```js
const { data } = useQuery({
  queryKey: ['dashboard', session.id],   // not ['dashboard', user.email]
  queryFn: fetchDashboard,
});

function logout() {
  queryClient.clear();
  localStorage.removeItem('persist:root');
  await fetch('/api/logout', { method: 'POST' });
}
```

If a store holds the snapshot, reset it on the logout action instead of only dropping the token.
For the service-worker layer, keep `/api` out of any precache and set the response header so the
browser can't reuse an authenticated response:

```js
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
```

Rotate the refresh token on logout so a reused JWT can't return the prior session's rows.
