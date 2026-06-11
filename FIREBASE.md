# FIREBASE.md - Migrating to Firebase Realtime Database

## Overview

This guide describes how to replace the current **Netlify Blobs + polling** architecture with **Firebase Realtime Database** for near-instant state sync (~50-100ms latency). Firebase provides a real-time database with built-in **listeners** that push updates to all connected clients automatically.

### Current Architecture (Blobs)
```
Client → POST /api/action → Netlify Function → Netlify Blobs
Client ← poll GET /api/state (1.5s) ← Netlify Function ← Netlify Blobs
```

### Target Architecture (Firebase)
```
Client → POST /api/action → Netlify Function → Firebase Realtime DB
Client ← realtime listener ← Firebase SDK ← Firebase Realtime DB
```

**Key difference:** Writes still go through the Netlify Function (server-authoritative), but reads switch from polling to a **persistent listener**. Every write to the database automatically pushes the new state to all subscribed clients.

---

## 1. Firebase Setup

### 1.1 Create Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Set:
   - **Project name:** `cardenveil`
   - **Google Analytics:** Disable (not needed)
4. Click **Create project**

### 1.2 Create Realtime Database

1. In the Firebase console → **Build** → **Realtime Database**
2. Click **Create Database**
3. Choose:
   - **Location:** `europe-west1` (or closest to players)
   - **Security rules:** Start in **test mode** (we'll lock down later)

### 1.3 Get Credentials

#### Client-side config (public, safe to expose):

1. Go to **Project Settings** (gear icon) → **General**
2. Scroll to **Your apps** → Click **Add app** → Choose **Web** (`</>`)
3. Register app name: `cardenveil-web`
4. Copy the `firebaseConfig` object:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "cardenveil.firebaseapp.com",
  databaseURL: "https://cardenveil-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cardenveil",
  storageBucket: "cardenveil.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

#### Server-side credentials (service account, NEVER expose):

1. **Project Settings** → **Service accounts**
2. Click **Generate new private key** → Download JSON file
3. This file contains `private_key`, `client_email`, etc.

### 1.4 Set Environment Variables

In Netlify dashboard → **Site configuration** → **Environment variables**:

| Variable | Value | Scope |
|----------|-------|-------|
| `FIREBASE_DATABASE_URL` | `https://cardenveil-default-rtdb.europe-west1.firebasedatabase.app` | All |
| `FIREBASE_PROJECT_ID` | `cardenveil` | Functions only |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxx@cardenveil.iam.gserviceaccount.com` | Functions only |
| `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\n..."` | Functions only |
| `VITE_FIREBASE_API_KEY` | `AIza...` | All |
| `VITE_FIREBASE_AUTH_DOMAIN` | `cardenveil.firebaseapp.com` | All |
| `VITE_FIREBASE_DATABASE_URL` | `https://cardenveil-default-rtdb.europe-west1.firebasedatabase.app` | All |
| `VITE_FIREBASE_PROJECT_ID` | `cardenveil` | All |
| `VITE_FIREBASE_APP_ID` | `1:123456789:web:abcdef` | All |

> **Important:** The `FIREBASE_PRIVATE_KEY` contains newlines. In Netlify env vars, replace `\n` with actual newlines or use the raw string from the JSON file.

---

## 2. Database Structure

### 2.1 Data Layout

Firebase Realtime Database is a JSON tree. Our structure:

```
/
└── games/
    └── {roomId}/
        ├── version: 42
        └── state: { /* dehydrated game state */ }
```

Each room is a node at `/games/{roomId}` containing `version` and `state`.

### 2.2 Security Rules

Go to **Realtime Database** → **Rules** tab:

```json
{
  "rules": {
    "games": {
      "$roomId": {
        ".read": true,
        ".write": false
      }
    }
  }
}
```

- **`.read: true`** — any client can read game state (it's inside OBR which has its own access control)
- **`.write: false`** — clients cannot write directly; all writes go through the Netlify Function using the admin SDK

---

## 3. Server-Side Changes

### 3.1 Install Dependencies

```bash
npm install firebase-admin
```

### 3.2 Create `netlify/functions/_firebaseAdmin.js`

```javascript
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

export const db = admin.database();
export default admin;
```

### 3.3 Replace `netlify/functions/state.js`

```javascript
import { db } from './_firebaseAdmin.js';
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

    const snapshot = await db.ref(`games/${roomId}`).get();
    if (!snapshot.exists()) return json({ version: 0, state: null });

    const data = snapshot.val();
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

    const ref = db.ref(`games/${roomId}`);

    const snapshot = await ref.get();
    let currentVersion = 0;
    let currentState;

    if (snapshot.exists()) {
      const data = snapshot.val();
      currentVersion = data.version;
      currentState = hydrateState(data.state);
    } else {
      currentState = createInitialGameState();
    }

    const { state: newState } = applyAction(currentState, action);
    const dehydrated = dehydrateState(newState);
    const newVersion = currentVersion + 1;

    await ref.set({ version: newVersion, state: dehydrated });

    return json({ version: newVersion, state: dehydrated }, 200, {
      'ETag': String(newVersion),
    });
  }

  return json({ error: 'Method not allowed' }, 405);
};
```

### 3.4 Atomic Writes with Transactions (Optional)

For stronger concurrency guarantees, use Firebase transactions:

```javascript
const ref = db.ref(`games/${roomId}`);

await ref.transaction((currentData) => {
  let currentState;
  let currentVersion;

  if (currentData) {
    currentVersion = currentData.version;
    currentState = hydrateState(currentData.state);
  } else {
    currentVersion = 0;
    currentState = createInitialGameState();
  }

  const { state: newState } = applyAction(currentState, action);
  const dehydrated = dehydrateState(newState);

  return { version: currentVersion + 1, state: dehydrated };
});
```

This ensures that if two Netlify Function invocations run concurrently, Firebase serializes them.

### 3.5 Remove Netlify Blobs

```bash
npm uninstall @netlify/blobs
```

---

## 4. Client-Side Changes

### 4.1 Install Firebase Client SDK

```bash
npm install firebase
```

### 4.2 Create `src/lib/firebaseClient.js`

```javascript
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const db = getDatabase(app);
```

### 4.3 Replace `src/lib/api.js`

```javascript
import { hydrateState } from './deck.js';
import { db } from './firebaseClient.js';
import { ref, onValue, off } from 'firebase/database';

let currentVersion = 0;
let listenerRef = null;
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

  listenerRef = ref(db, `games/${roomId}`);
  onValue(listenerRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    if (data.version <= currentVersion) return;
    currentVersion = data.version;
    if (onStateCallback) {
      onStateCallback(hydrateState(data.state));
    }
  });
}

export function stopRealtime() {
  if (listenerRef) {
    off(listenerRef);
    listenerRef = null;
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

## 6. Free Tier Limits (Spark Plan)

| Resource | Free Tier | Our Usage |
|----------|-----------|-----------|
| Database storage | 1 GB | ~30 KB per room |
| Download bandwidth | 10 GB/month | ~30 KB per action × actions |
| Concurrent connections | 100 per database | ~6 per game |
| Simultaneous writes | No hard limit | Low for typical usage |

---

## 7. Implementation Checklist

- [ ] Create Firebase project
- [ ] Create Realtime Database (choose region)
- [ ] Set database security rules (read: true, write: false)
- [ ] Register web app and get config
- [ ] Generate service account private key
- [ ] Add all environment variables to Netlify
- [ ] `npm install firebase-admin firebase`
- [ ] `npm uninstall @netlify/blobs`
- [ ] Create `netlify/functions/_firebaseAdmin.js`
- [ ] Replace `netlify/functions/state.js` with Firebase version
- [ ] Create `src/lib/firebaseClient.js`
- [ ] Replace `src/lib/api.js` with realtime listener version
- [ ] Update `CardGame.svelte` imports and lifecycle
- [ ] Update `HandPopover.svelte` imports and lifecycle
- [ ] Test locally with `netlify dev`
- [ ] Deploy and verify realtime sync

---

## 8. Advantages Over Blobs + Polling

| Aspect | Blobs + Polling | Firebase Realtime |
|--------|-----------------|-------------------|
| Sync latency | 1.5s (poll interval) | ~50-100ms (persistent listener) |
| Bandwidth | Polls even when no change | Push only on change |
| Concurrent players | Each polls independently | Shared listener per room |
| Connection persistence | HTTP requests only | Persistent WebSocket |
| Offline resilience | None | Firebase SDK queues writes |
| Data inspection | Opaque blobs | Firebase console data browser |
| Cost at scale | 500 MB blobs limit | 1 GB storage + 10 GB bandwidth |

---

## 9. Firestore Alternative

Firebase also offers **Cloud Firestore**, a more modern NoSQL database. Here's when to consider it:

| Feature | Realtime Database | Firestore |
|---------|-------------------|-----------|
| Data model | JSON tree | Collections + documents |
| Queries | Limited (single property) | Rich (compound, indexed) |
| Offline support | Basic | Full (local cache) |
| Scaling | Single server | Multi-region |
| Free tier bandwidth | 10 GB/month | 10 GB/month egress |
| Max concurrent connections | 100 per DB | No hard limit |
| Best for | Simple real-time sync | Complex queries + real-time |

For Cardenveil, **Realtime Database is the better fit** because:
- We store one JSON blob per room (no need for document queries)
- We need simple real-time push (not complex queries)
- The data model maps directly to a JSON tree
- Lower latency for simple reads/writes

If you wanted Firestore instead, the changes would be:
- Replace `firebase/database` with `firebase/firestore`
- Use `doc(db, 'games', roomId)` instead of `ref(db, 'games/' + roomId)`
- Use `onSnapshot()` instead of `onValue()`
- Server-side: use `admin.firestore()` instead of `admin.database()`

---

## 10. Potential Issues

- **Service account key management:** The private key is a sensitive secret. If leaked, it grants full admin access to your Firebase project. Rotate keys periodically.
- **Connection limits:** 100 concurrent connections per database on free tier. Each OBR player opens 1-2 connections. Fine for ~50 concurrent players. For more, consider sharding across multiple databases or upgrading to Blaze (pay-as-you-go).
- **Cold start on Netlify Functions:** The `firebase-admin` SDK is heavy (~50 MB). First function invocation may take 2-3s. Subsequent calls are fast due to warm containers.
- **WebSocket in OBR iframe:** Firebase SDK uses long-polling as fallback if WebSocket is blocked. Should work in OBR iframes, but test specifically.
- **Private key newlines:** Netlify env vars may mangle `\n` in the private key. Use `replace(/\\n/g, '\n')` in the init code (already included in the example).
