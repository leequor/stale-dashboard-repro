import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/dashboard.mjs";

test("reproduces the reported bug: stale dashboard after logout/login", async () => {
  const app = createApp();
  await app.login("dana");
  const before = await app.dashboard();

  app.logout();
  app.insertRows(2);
  await app.login("dana");
  const after = await app.dashboard();

  assert.deepEqual(after, before, "client keeps showing the previous session's snapshot");
  assert.notDeepEqual(after, app.readDashboard(), "database has newer data the UI never fetched");
});

test("clearing the query cache alone still fails if responses are URL-cached", async () => {
  const app = createApp({ clearOnLogout: true, noStore: false });
  await app.login("dana");
  const first = await app.dashboard();

  app.logout();
  app.insertRows(2);
  await app.login("dana");
  const after = await app.dashboard();

  assert.deepEqual(after, first, "the HTTP/service-worker cache is still serving the old snapshot");
  assert.notDeepEqual(after, app.readDashboard());
});

test("both fixes together return fresh data on every login", async () => {
  const app = createApp({ clearOnLogout: true, noStore: true });
  await app.login("dana");
  const first = await app.dashboard();

  app.logout();
  app.insertRows(2);
  await app.login("dana");
  const after = await app.dashboard();

  assert.notDeepEqual(after, first);
  assert.deepEqual(after, app.readDashboard());
});

test("the fix keeps caching working inside a live session", async () => {
  const app = createApp({ clearOnLogout: true, noStore: true });
  await app.login("dana");
  await app.dashboard();
  await app.dashboard();
  await app.dashboard();

  assert.equal(app.counters.apiCalls, 1, "repeat reads still served from the query cache");
  assert.equal(app.counters.cacheHits, 0, "no stale HTTP cache layer needed");
});
