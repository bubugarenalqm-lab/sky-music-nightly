import {createClient} from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ymafrzspsikwzjvetlzb.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BtXw-GgtwCCFuWnm1blMGQ_YSP2Mmev'

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY)

export type ShopSheetListItem = {
    id: number
    name: string
    author: string | null
    bpm: number
    transcribed_by: string
}

export type ShopSheetFull = {
    id: number
    name: string
    author: string | null
    transcribed_by: string
    bpm: number
    data: any
    created_at: string
}

export async function fetchShopSheetsList(): Promise<ShopSheetListItem[]> {
    const {data, error} = await supabaseClient
        .from('shop_sheets')
        .select('id,name,author,bpm,transcribed_by')
        .order('name', {ascending: true})
    if (error) throw error
    return data as ShopSheetListItem[]
}

export async function fetchShopSheetData(id: number): Promise<ShopSheetFull | null> {
    const {data, error} = await supabaseClient
        .from('shop_sheets')
        .select('*')
        .eq('id', id)
        .single()
    if (error) throw error
    return data as ShopSheetFull
}
