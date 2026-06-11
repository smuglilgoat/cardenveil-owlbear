# SUPABASE.md - Migrating to Supabase Realtime

## Overview

This guide describes how to replace the current **Netlify Blobs + polling** architecture with **Supabase** for near-instant state sync (~100ms latency). Supabase provides a PostgreSQL database with built-in **realtime subscriptions** via WebSocket, eliminating the need for client-side polling.

### Current Architecture (Blobs)
```
Client → POST /api/action → Netlify Function → Netlify Blobs
Client ← poll GET /api/state (1.5s) ← Netlify Function ← Netlify Blobs
```

### Target Architecture (Supabase)
```
Client → POST /api/action → Netlify Function → Supabase (PostgreSQL)
Client ← realtime WebSocket ← Supabase Realtime ← Supabase (PostgreSQL)
```

**Key difference:** Writes still go through the Netlify Function (server-authoritative), but reads switch from polling to a **realtime subscription**. Every write to the database automatically pushes the new state to all subscribed clients.

---

## 1. Supabase Setup

### 1.1 Create Account and Project

1. Go to [supabase.com](https://supabase.com) and sign up (GitHub login works)
2. Click **New Project**
3. Set:
   - **Name:** `cardenveil`
   - **Database Password:** (save this somewhere secure)
   - **Region:** Choose closest to your players (e.g., `eu-west-1` for Europe)
4. Wait for project to initialize (~2 minutes)

### 1.2 Get Credentials

From your project dashboard → **Settings** → **API**:
- **Project URL:** `https://xxxxx.supabase.co`
- **anon public key:** `eyJ...` (safe to expose in client code)
- **service_role key:** `eyJ...` (NEVER expose in client — use only in Netlify Functions)

### 1.3 Set Environment Variables

In Netlify dashboard → **Site configuration** → **Environment variables**:

| Variable | Value | Scope |
|----------|-------|-------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Functions only |
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | All |

The `VITE_` prefix makes variables available to the client-side Vite build.

---

## 2. Database Schema

### 2.1 Create the Table

Go to **SQL Editor** in the Supabase dashboard and run:

```sql
CREATE TABLE game_rooms (
  room_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_rooms_updated ON game_rooms(updated_at);
```

### 2.1a Optimistic Concurrency Control (OCC) Stored Procedure

To prevent race conditions where concurrent writes silently overwrite each other, create this stored procedure. It checks the version column before writing and returns a conflict flag when the expected version does not match.

```sql
CREATE OR REPLACE FUNCTION apply_game_action(
  p_room_id TEXT,
  p_expected_version INTEGER,
  p_new_version INTEGER,
  p_state JSONB
) RETURNS JSONB AS $$
DECLARE
  current_row game_rooms%ROWTYPE;
  result JSONB;
BEGIN
  -- Try to get existing row
  SELECT * INTO current_row FROM game_rooms WHERE room_id = p_room_id;

  IF NOT FOUND THEN
    -- No row exists — insert new (initial game creation)
    INSERT INTO game_rooms (room_id, version, state, updated_at)
    VALUES (p_room_id, p_new_version, p_state, NOW());
    result := jsonb_build_object('version', p_new_version, 'state', p_state);
  ELSIF current_row.version = p_expected_version THEN
    -- Version matches — safe to update
    UPDATE game_rooms
    SET version = p_new_version, state = p_state, updated_at = NOW()
    WHERE room_id = p_room_id;
    result := jsonb_build_object('version', p_new_version, 'state', p_state);
  ELSE
    -- Version mismatch — return conflict with current data so caller can retry
    result := jsonb_build_object(
      'conflict', true,
      'version', current_row.version,
      'state', current_row.state
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

### 2.2 Enable Realtime

Go to **Database** → **Replication** → Enable replication for the `game_rooms` table.

Or via SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
```

### 2.3 Row Level Security (RLS)

Since the app runs inside OBR (which has its own auth), we use a permissive policy. The server-authoritative function handles validation.

```sql
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations"
  ON game_rooms
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

> **Security note:** This is intentionally permissive because validation happens server-side in the Netlify Function. OBR plugin contexts don't have traditional user auth. If you add OBR token verification later, you can tighten RLS policies.

---

## 3. Server-Side Changes

### 3.1 Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 3.2 Create `netlify/functions/_supabaseClient.js`

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default supabase;
```

### 3.3 Replace `netlify/functions/state.js`

```javascript
import supabase from './_supabaseClient.js';
import { applyAction, hydrateState, dehydrateState, createInitialGameState } from './_gameLogic.js';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extraHeaders },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) return json({ error: 'roomId required' }, 400);

    const { data, error } = await supabase
      .from('game_rooms')
      .select('version, state')
      .eq('room_id', roomId)
      .single();

    if (error || !data) return json({ version: 0, state: null });

    const clientVersion = request.headers.get('If-None-Match');
    if (clientVersion && String(data.version) === clientVersion) {
      return new Response(null, { status: 304, headers: corsHeaders() });
    }

    return json({ version: data.version, state: data.state }, 200, {
      'ETag': String(data.version),
    });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { roomId, action } = body;
    if (!roomId || !action) return json({ error: 'roomId and action required' }, 400);

    const { data: existing, error } = await supabase
      .from('game_rooms')
      .select('version, state')
      .eq('room_id', roomId)
      .single();

    let currentVersion = 0;
    let currentState;

    if (existing && !error) {
      currentVersion = existing.version;
      currentState = hydrateState(existing.state);
    } else {
      currentState = createInitialGameState();
    }

    const { state: newState } = applyAction(currentState, action);
    const dehydrated = dehydrateState(newState);
    const newVersion = currentVersion + 1;

    const { error: upsertError } = await supabase
      .from('game_rooms')
      .upsert({
        room_id: roomId,
        version: newVersion,
        state: dehydrated,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      return json({ error: upsertError.message }, 500);
    }

    return json({ version: newVersion, state: dehydrated }, 200, {
      'ETag': String(newVersion),
    });
  }

  return json({ error: 'Method not allowed' }, 405);
};
```

### 3.4 Remove Netlify Blobs

```bash
npm uninstall @netlify/blobs
```

---

## 4. Client-Side Changes

### 4.1 Supabase JS Client

Already installed from step 3.1 — the same `@supabase/supabase-js` package works for both server and client.

### 4.2 Create `src/lib/supabaseClient.js`

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### 4.3 Replace `src/lib/api.js`

```javascript
import { hydrateState } from './deck.js';
import { supabase } from './supabaseClient.js';

let currentVersion = 0;
let realtimeChannel = null;
let onStateCallback = null;

export async function fetchState(roomId) {
  const res = await fetch(`/api/state?roomId=${encodeURIComponent(roomId)}`, {
    headers: currentVersion ? { 'If-None-Match': String(currentVersion) } : {},
  });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.version != null) currentVersion = data.version;
  if (!data.state) return null;
  return hydrateState(data.state);
}

export function startRealtime(roomId, onState) {
  onStateCallback = onState;
  stopRealtime();

  realtimeChannel = supabase
    .channel(`game:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const newRow = payload.new;
        if (!newRow) return;
        if (newRow.version <= currentVersion) return;
        currentVersion = newRow.version;
        if (onStateCallback) {
          onStateCallback(hydrateState(newRow.state));
        }
      }
    )
    .subscribe();
}

export function stopRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

export async function dispatch(roomId, action) {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, action }),
  });
  if (!res.ok) throw new Error(`Dispatch failed: ${res.status}`);
  const data = await res.json();
  if (data.version != null) currentVersion = data.version;
  return hydrateState(data.state);
}
```

### 4.4 Update `src/lib/CardGame.svelte`

Replace the polling imports and calls:

```diff
- import { startPolling, stopPolling, dispatch, fetchState } from './api.js';
+ import { startRealtime, stopRealtime, dispatch, fetchState } from './api.js';
```

In `onMount`, replace:
```diff
- startPolling(roomId, (newState) => {
-   gameState = newState;
- }, 1500);
+ startRealtime(roomId, (newState) => {
+   gameState = newState;
+ });
```

In `onDestroy`, replace:
```diff
- stopPolling();
+ stopRealtime();
```

### 4.5 Update `src/HandPopover.svelte`

Same pattern:

```diff
- import { startPolling, stopPolling, dispatch } from './lib/api.js';
+ import { startRealtime, stopRealtime, dispatch } from './lib/api.js';
```

Replace `startPolling` → `startRealtime` and `stopPolling` → `stopRealtime`.

---

## 5. What Stays the Same

These files require **zero changes**:
- `netlify/functions/_gameLogic.js` — action reducer is database-agnostic
- `src/lib/PlayerHand.svelte` — still calls `onAction()`
- `src/lib/GMDashboard.svelte` — still calls `onAction()`
- `src/lib/deck.js` — still used for client-side hydration
- `netlify.toml` — function directory and redirects unchanged
- All UI components

---

## 6. Free Tier Limits

| Resource | Free Tier | Our Usage |
|----------|-----------|-----------|
| Database size | 500 MB | ~30 KB per room |
| Bandwidth | 2 GB/month | ~30 KB per action × actions |
| Realtime connections | 200 concurrent | ~6 per game |
| Realtime messages | 2M/month | Low for typical usage |
| API requests | Unlimited | N/A |

---

## 7. Implementation Checklist

- [ ] Create Supabase project
- [ ] Run SQL to create `game_rooms` table
- [ ] Run SQL to create `apply_game_action()` stored procedure
- [ ] Enable realtime replication on `game_rooms`
- [ ] Set RLS policies
- [ ] Add environment variables to Netlify
- [ ] `npm install @supabase/supabase-js`
- [ ] `npm uninstall @netlify/blobs`
- [ ] Create `netlify/functions/_supabaseClient.js`
- [ ] Replace `netlify/functions/state.js` with Supabase version
- [ ] Create `src/lib/supabaseClient.js`
- [ ] Replace `src/lib/api.js` with realtime version
- [ ] Update `CardGame.svelte` imports and lifecycle
- [ ] Update `HandPopover.svelte` imports and lifecycle
- [ ] Test locally with `netlify dev`
- [ ] Deploy and verify realtime sync

---

## 8. Advantages Over Blobs + Polling

| Aspect | Blobs + Polling | Supabase Realtime |
|--------|-----------------|-------------------|
| Sync latency | 1.5s (poll interval) | ~100ms (WebSocket push) |
| Bandwidth | Polls even when no change | Push only on change |
| Concurrent players | Each polls independently | Shared WebSocket channel |
| Database | KV store (no queries) | PostgreSQL (full SQL) |
| Data inspection | Opaque blobs | Supabase dashboard table editor |
| Cost at scale | 500 MB blobs limit | 500 MB DB + 2 GB bandwidth |

## 9. Potential Issues

- **Supabase project pausing:** Free tier projects pause after 7 days of inactivity. First request after pause takes ~10s. Mitigation: keep a cron job pinging the API, or upgrade to Pro ($25/mo).
- **Realtime connection limits:** 200 concurrent connections on free tier. Each OBR player opens 1-2 connections (main panel + hand popover). Fine for ~100 concurrent players.
- **WebSocket in OBR iframe:** OBR plugins run in iframes. Supabase WebSocket should work, but test in the OBR environment specifically.
