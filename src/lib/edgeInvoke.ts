/**
 * edgeInvoke — supabase.functions.invoke() wrapper that surfaces the real error.
 *
 * The stock client returns `FunctionsHttpError` with just the status code
 * when the function returns non-2xx — the body (where our actual
 * `{ error: 'rate limit exceeded' }` / `{ error: 'email already in use' }`
 * payload lives) gets buried in `error.context`.
 *
 * This wrapper pulls the body out so the caller sees the actual message.
 *
 * Usage:
 *   const data = await edgeInvoke<{ user_id: string; temp_password: string }>(
 *     'provision-business-user',
 *     { action: 'add_member', org_id, email, role },
 *   );
 *   // throws Error with the real message on non-2xx
 */

import { supabase } from './supabase';

export interface EdgeError extends Error {
    status?:    number;
    body?:      any;
    functionName?: string;
}

export async function edgeInvoke<T = any>(
    fn: string,
    body: Record<string, unknown>,
): Promise<T> {
    const { data, error } = await supabase.functions.invoke(fn, { body });

    if (error) {
        // FunctionsHttpError has `context: Response`. Try to drain it.
        let realMessage = error.message ?? `${fn} failed`;
        let status: number | undefined;
        let parsedBody: any = null;

        try {
            const ctx = (error as any).context as Response | undefined;
            if (ctx && typeof ctx.text === 'function') {
                status = ctx.status;
                const text = await ctx.text();
                if (text) {
                    try {
                        parsedBody = JSON.parse(text);
                        if (parsedBody?.error) {
                            realMessage = parsedBody.error;
                        } else if (parsedBody?.message) {
                            realMessage = parsedBody.message;
                        }
                    } catch {
                        // Body wasn't JSON — surface the raw text.
                        realMessage = text.slice(0, 300);
                    }
                }
            }
        } catch {
            // best-effort — if context isn't drainable, fall back to the
            // generic message.
        }

        const err = new Error(realMessage) as EdgeError;
        err.status       = status;
        err.body         = parsedBody;
        err.functionName = fn;
        throw err;
    }

    // Some functions return { ok: false, error } at 200 status for soft
    // failures (validation, etc). Treat those as throws too so callers
    // can use a single try/catch.
    if (data && typeof data === 'object' && (data as any).ok === false) {
        const msg = (data as any).error ?? `${fn} returned ok=false`;
        const err = new Error(msg) as EdgeError;
        err.status = 200;
        err.body = data;
        err.functionName = fn;
        throw err;
    }

    return data as T;
}
