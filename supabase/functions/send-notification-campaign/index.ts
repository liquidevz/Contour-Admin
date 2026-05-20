// Edge Function to send push notification campaigns
// This function picks up pending campaigns and sends them via Expo Push API

// @deno-types="https://deno.land/x/types/index.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Declare Deno global for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo recommends batches of 100

interface PushToken {
  user_id: string;
  token: string;
  platform: string;
}

interface Campaign {
  id: string;
  title: string;
  body: string;
  audience: string;
  user_ids: string[] | null;
  deep_link: string | null;
  data: Record<string, unknown> | null;
}

serve(async (req: { json: () => Promise<any>; }) => {
  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get campaign ID from request or find next pending campaign
    const { campaignId } = await req.json().catch(() => ({}));

    let campaign: Campaign | null = null;

    if (campaignId) {
      // Send specific campaign
      const { data } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('status', 'pending')
        .single();
      campaign = data;
    } else {
      // Find next pending campaign (scheduled or immediate)
      const { data } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('status', 'pending')
        .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      campaign = data;
    }

    if (!campaign) {
      return new Response(
        JSON.stringify({ message: 'No pending campaigns found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Mark campaign as sending
    await supabase
      .from('notification_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id);

    // Resolve audience to push tokens
    const tokens = await resolveAudience(supabase, campaign);

    if (tokens.length === 0) {
      await supabase
        .from('notification_campaigns')
        .update({
          status: 'failed',
          error: 'No push tokens found for this audience',
          recipients_count: 0,
        })
        .eq('id', campaign.id);

      return new Response(
        JSON.stringify({ message: 'No recipients found', campaignId: campaign.id }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build Expo push messages
    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title: campaign.title,
      body: campaign.body,
      data: {
        ...(campaign.data || {}),
        deepLink: campaign.deep_link,
        campaignId: campaign.id,
      },
    }));

    // Send in batches
    let delivered = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        const result = await response.json();

        if (result.data) {
          for (const ticket of result.data) {
            if (ticket.status === 'ok') {
              delivered++;
            } else {
              failed++;
              if (ticket.message) {
                errors.push(ticket.message);
              }
            }
          }
        }
      } catch (error: unknown) {
        failed += batch.length;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Batch error: ${errorMessage}`);
      }
    }

    // Update campaign with results
    await supabase
      .from('notification_campaigns')
      .update({
        status: failed === messages.length ? 'failed' : 'sent',
        sent_at: new Date().toISOString(),
        recipients_count: tokens.length,
        delivered_count: delivered,
        failed_count: failed,
        error: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      })
      .eq('id', campaign.id);

    return new Response(
      JSON.stringify({
        success: true,
        campaignId: campaign.id,
        recipients: tokens.length,
        delivered,
        failed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Campaign send error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function resolveAudience(
  supabase: SupabaseClient,
  campaign: Campaign
): Promise<PushToken[]> {
  let query = supabase
    .from('user_push_tokens')
    .select('user_id, token, platform');

  switch (campaign.audience) {
    case 'user_ids':
      if (!campaign.user_ids || campaign.user_ids.length === 0) {
        return [];
      }
      query = query.in('user_id', campaign.user_ids);
      break;

    case 'approved': {
      // Get approved user IDs first
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('access_status', 'approved');

      if (!profiles || profiles.length === 0) return [];

      const userIds = profiles.map((p: any) => p.id);
      query = query.in('user_id', userIds);
      break;
    }

    case 'active_7d': {
      // Get users active in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: events } = await supabase
        .from('user_events')
        .select('user_id')
        .gte('created_at', sevenDaysAgo.toISOString());

      if (!events || events.length === 0) return [];

      const userIds = [...new Set(events.map((e: any) => e.user_id))];
      query = query.in('user_id', userIds);
      break;
    }

    case 'active_30d': {
      // Get users active in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: events } = await supabase
        .from('user_events')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (!events || events.length === 0) return [];

      const userIds = [...new Set(events.map((e: any) => e.user_id))];
      query = query.in('user_id', userIds);
      break;
    }

    case 'all':
    default:
      // No filter, send to all tokens
      break;
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error resolving audience:', error);
    return [];
  }

  return data || [];
}
