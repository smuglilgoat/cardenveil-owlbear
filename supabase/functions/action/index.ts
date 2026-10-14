import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { applyAction, hydrateState, dehydrateState, createInitialGameState } from './_gameLogic.ts'
import {
  verifyActor,
  mintToken,
  hashToken,
  rememberTokenHash,
  isDuplicateAction,
  rememberActionId,
} from './_actionGuard.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { roomId, action } = await req.json()

    if (!roomId || !action) {
      return new Response(
        JSON.stringify({ error: 'roomId and action required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const MAX_RETRIES = 10
    let attempt = 0

    while (attempt < MAX_RETRIES) {
      const { data: existing, error } = await supabase
        .from('game_rooms')
        .select('version, state')
        .eq('room_id', roomId)
        .single()

      let currentVersion = 0
      let currentState

      if (error && error.code !== 'PGRST116') {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (existing) {
        currentVersion = existing.version
        currentState = hydrateState(existing.state)
      } else {
        currentState = createInitialGameState()
      }

      const actorId = action.actorId ?? action.playerId

      // A retried action must not be applied twice: when this function commits
      // but its response is lost, the client re-sends it to the Netlify fallback.
      if (isDuplicateAction(currentState, action.actionId)) {
        return new Response(
          JSON.stringify({ version: currentVersion, state: existing?.state ?? dehydrateState(currentState) }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const verdict = await verifyActor(currentState, action)
      if (!verdict.ok) {
        return new Response(
          JSON.stringify({ error: 'unauthorized', reason: verdict.reason }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { state: appliedState } = applyAction(currentState, action)
      // Mint for an identity that has no hash yet — including one claimed by
      // this very action (INIT_GAME, REGISTER_PLAYER, CREATE_GM_CHAR). The GM
      // and the GM character act without a player record, so this checks both.
      const actorKnown = !!appliedState.players?.[actorId] || appliedState.gmId === actorId
      const minted = actorKnown && (appliedState.actorTokens?.[actorId] ?? []).length === 0 ? mintToken() : null
      let newState = rememberActionId(appliedState, action.actionId)
      if (minted) newState = rememberTokenHash(newState, actorId, await hashToken(minted))

      const dehydrated = dehydrateState(newState)
      const newVersion = currentVersion + 1

      const { data: rpcData, error: rpcError } = await supabase.rpc('apply_game_action', {
        p_room_id: roomId,
        p_expected_version: currentVersion,
        p_new_version: newVersion,
        p_state: dehydrated,
      })

      if (rpcError) {
        return new Response(
          JSON.stringify({ error: rpcError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (rpcData && rpcData.conflict) {
        attempt++
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(100 * Math.pow(2, attempt), 2000)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        return new Response(
          JSON.stringify({
            error: 'Conflict: version mismatch after max retries',
            version: rpcData.version,
            state: rpcData.state,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ version: newVersion, state: dehydrated, token: minted ?? undefined }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Conflict: unable to apply action after max retries' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
