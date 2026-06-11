import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { applyAction, hydrateState, dehydrateState, createInitialGameState } from './_gameLogic.ts'

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

      const { state: newState } = applyAction(currentState, action)
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
        JSON.stringify({ version: newVersion, state: dehydrated }),
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
