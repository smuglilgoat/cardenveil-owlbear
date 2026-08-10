# HTTPie Test Files

This directory contains HTTPie JSON test exports for testing the Supabase API flow.

## Prerequisites

Install HTTPie:
```bash
# macOS
brew install httpie

# Linux
sudo apt install httpie

# Or via pip
pip install httpie
```

## Usage

### Get Game State
```bash
http GET http://localhost:8888/.netlify/functions/state roomId==test-room-123
```

### Apply Action (Draw Card)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"DRAW","playerId":"player-1"}'
```

### Apply Action (Discard Card)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"DISCARD","playerId":"player-1","cardId":"n-S-5-abc123","from":"hand"}'
```

### Apply Action (Crystallize Card)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"CRYSTALLIZE","playerId":"player-1","cardId":"n-H-7-xyz789"}'
```

### Apply Action (Propose Exchange)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"PROPOSE_EXCHANGE","playerId":"player-1","cardId":"n-C-3-def456","targetId":"player-2"}'
```

### Apply Action (Accept Exchange)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"ACCEPT_EXCHANGE","playerId":"player-2","exchangeId":"exchange-123","cardId":"n-D-9-ghi789"}'
```

### Apply Action (Decline Exchange)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"DECLINE_EXCHANGE","playerId":"player-2","exchangeId":"exchange-123"}'
```

### Apply Action (Spend Token)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"SPEND_TOKEN","playerId":"player-1","token":"force"}'
```

### Apply Action (Use Agilité)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"USE_AGILITE","playerId":"player-1","cardId":"n-S-5-abc123","suit":"♥"}'
```

### Apply Action (Use Esprit)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"USE_ESPRIT","playerId":"player-1"}'
```

### Apply Action (Create GM Character)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"CREATE_GM_CHAR","playerId":"gm-player-id"}'
```

### Apply Action (Give Cards)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"GIVE_CARDS","playerId":"gm-player-id","targetId":"player-1","crystal":false,"mode":"random","count":2}'
```

### Apply Action (Deal to All)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"DEAL_ALL","playerId":"gm-player-id"}'
```

### Apply Action (Rest All)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"REST_ALL","playerId":"gm-player-id"}'
```

### Apply Action (Hard Reset)
```bash
http POST http://localhost:8888/.netlify/functions/state \
  roomId=test-room-123 \
  action:='{"type":"HARD_RESET","playerId":"gm-player-id"}'
```

## Testing with Conditional Requests (ETag)

```bash
# First request - get state and ETag
http GET http://localhost:8888/.netlify/functions/state roomId==test-room-123

# Second request with If-None-Match header (should return 304 if unchanged)
http GET http://localhost:8888/.netlify/functions/state \
  roomId==test-room-123 \
  If-None-Match:1
```

## Testing Conflict Resolution

```bash
# Simulate concurrent updates by sending multiple rapid requests
for i in {1..5}; do
  http POST http://localhost:8888/.netlify/functions/state \
    roomId=test-room-123 \
    action:='{"type":"DRAW","playerId":"player-1"}' &
done
wait
```

## Notes

- Replace `test-room-123` with your actual room ID
- Replace `player-1`, `player-2` with actual player IDs
- Replace card IDs with actual card IDs from your game state
- The API endpoint is `/.netlify/functions/state` when running locally with `netlify dev`
- For production, use your deployed Netlify function URL
