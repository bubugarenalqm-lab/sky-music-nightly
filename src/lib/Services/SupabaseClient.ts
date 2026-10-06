import {createClient, SupabaseClient} from "@supabase/supabase-js"

/**
 * Lazily-created singleton Supabase client for the device-permission feature.
 * If env vars are missing, returns null — callers must treat that as
 * "cannot confirm permission" (i.e. stay scrambled), never as a reason to
 * show original notes.
 */

let client: SupabaseClient | null | undefined = undefined // undefined = not attempted yet

export function getSupabaseClient(): SupabaseClient | null {
    if (client !== undefined) return client

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anonKey) {
        console.warn("[DevicePermission] Supabase env vars missing — notes will stay scrambled for all devices until configured.")
        client = null
        return client
    }

    client = createClient(url, anonKey)
    return client
}
