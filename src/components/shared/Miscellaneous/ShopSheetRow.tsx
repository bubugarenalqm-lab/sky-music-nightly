import { markLibrarySheet } from '$lib/Songs/LibrarySheet'
import { useState } from 'react'
import { FaSpinner, FaMusic } from 'react-icons/fa'
import { logger } from '$stores/LoggerStore'
import { songService } from '$lib/Services/SongService'
import { fetchShopSheetData, ShopSheetListItem } from '$lib/Services/SupabaseService'
import type { Theme } from '$stores/ThemeStore/ThemeProvider'

export type ShopSheetMeta = {
    author: string | null
    transcribedBy: string
    bpm: number
}
interface ShopSheetRowProps {
    data: ShopSheetListItem
    theme: Theme
    onLoad: (song: any, meta: ShopSheetMeta) => void
    isSelected: boolean
}

const GRADIENTS = [
    'linear-gradient(135deg, #f7971e, #ffd200)',
    'linear-gradient(135deg, #56ccf2, #2f80ed)',
    'linear-gradient(135deg, #834d9b, #d04ed6)',
    'linear-gradient(135deg, #eb3349, #f45c43)',
    'linear-gradient(135deg, #11998e, #38ef7d)',
    'linear-gradient(135deg, #4776e6, #8e54e9)',
]

function gradientForName(name: string) {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
    return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

export default function ShopSheetRow({ data, onLoad, isSelected }: ShopSheetRowProps) {
    const [fetching, setFetching] = useState(false)
    const load = async function () {
        if (fetching) return
        try {
            setFetching(true)
            const row = await fetchShopSheetData(data.id)
            setFetching(false)
            if (!row) return logger.error('Song not found')
            const parsed = songService.parseSong(row.data)
            markLibrarySheet(parsed)
            onLoad(parsed, {
                author: row.author,
                transcribedBy: row.transcribed_by,
                bpm: row.bpm
            })
        } catch (e) {
            setFetching(false)
            console.error(e)
            logger.error('Error loading song')
        }
    }

    const gradient = gradientForName(data.name || 'song')

    return <div style={{
        borderRadius: '0.6rem',
        overflow: 'hidden',
        background: 'var(--menu-background)',
        border: isSelected ? 'solid 0.15rem var(--accent)' : 'solid 0.15rem transparent'
    }}>
        <div style={{
            background: gradient,
            padding: '1.2rem 0.8rem',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
                position: 'absolute',
                top: '0.5rem',
                left: '0.5rem',
                background: 'rgba(0,0,0,0.5)',
                color: '#fff',
                fontSize: '0.7rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '1rem'
            }}>
                Miễn phí
            </div>
            {fetching
                ? <FaSpinner className='spin' size={28} color="#fff" />
                : <FaMusic size={28} color="#fff" />
            }
        </div>
        <div style={{ padding: '0.6rem 0.8rem' }}>
            <div style={{
                fontWeight: 'bold',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}>
                {data.name}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.1rem' }}>
                {data.author || 'Unknown'} {data.bpm ? `| BPM: ${data.bpm}` : ''}
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '0.5rem'
            }}>
                <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                    By {data.transcribed_by || 'Tyn'}
                </div>
                <button
                    onClick={load}
                    disabled={fetching}
                    style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-text)',
                        border: 'none',
                        borderRadius: '0.3rem',
                        padding: '0.3rem 0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    {fetching ? '...' : 'Chơi'}
                </button>
            </div>
        </div>
    </div>
}