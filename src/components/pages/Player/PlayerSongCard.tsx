import { useEffect, useState } from 'react'
import { FaCrosshairs, FaRegCircle, FaEllipsisH, FaPen, FaFolder, FaEdit, FaDownload, FaTrash } from 'react-icons/fa'
import { SongStorable } from '$lib/Songs/Song'
import { Theme } from '$stores/ThemeStore/ThemeProvider'
import { Folder } from '$lib/Folder'
import { RecordedOrComposed } from '$types/SongTypes'
import { RecordedSong } from '$lib/Songs/RecordedSong'
import { ComposedSong } from '$lib/Songs/ComposedSong'
import { Midi } from '@tonejs/midi'
import { songService } from '$lib/Services/SongService'
import { songsStore } from '$stores/SongsStore'
import { playerStore } from '$stores/PlayerStore'
import { logger } from '$stores/LoggerStore'
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from '$cmp/shared/Utility/FloatingDropdown'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'

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

interface PlayerSongCardProps {
    data: SongStorable
    theme: Theme
    folders: Folder[]
    functions: {
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string) => void
        toggleMenu: (override?: boolean) => void
        downloadSong: (song: RecordedSong | ComposedSong | Midi) => void
    }
}

export function PlayerSongCard({ data, functions, theme, folders }: PlayerSongCardProps) {
    const { t } = useTranslation(['player', 'common', 'menu', 'logs', 'settings'])
    const { removeSong, toggleMenu, downloadSong, renameSong } = functions
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => { setSongName(data.name) }, [data.name])

    if (data.type === 'vsrg') return null

    const gradient = gradientForName(data.name || 'song')
    const play = async () => {
        if (isRenaming) return
        playerStore.load(await songService.fromStorableSong(data) as RecordedOrComposed)
        toggleMenu(false)
    }

    return <div style={{
        borderRadius: '0.6rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--menu-background)',
        marginBottom: '0.5rem'
    }}>
        <div style={{
            background: gradient,
            padding: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            {isRenaming
                ? <input
                    className="song-name-input"
                    onChange={e => setSongName(e.target.value)}
                    style={{ width: '100%', color: '#151414' }}
                    value={songName}
                />
                : <div style={{ fontWeight: 'bold', color: '#151414', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {songName}
                </div>
            }
            <FloatingDropdown
                Icon={FaEllipsisH}
                ignoreClickOutside={isRenaming}
                tooltip={t('settings:more_options')}
                onClose={() => setIsRenaming(false)}
            >
                <FloatingDropdownRow onClick={() => {
                    if (isRenaming) {
                        renameSong(songName, data.id!)
                        setIsRenaming(false)
                    }
                    setIsRenaming(!isRenaming)
                }}>
                    <FaPen style={{ marginRight: '0.4rem' }} size={14} />
                    <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow style={{ padding: '0 0.4rem' }}>
                    <FaFolder style={{ marginRight: '0.4rem' }} />
                    <select className='dropdown-select'
                        value={data.folderId || "_None"}
                        onChange={async (e) => {
                            const id = e.target.value
                            const song = await songService.getOneSerializedFromStorable(data)
                            if (!song) return logger.error(t('logs:could_not_find_song'))
                            songsStore.addSongToFolder(song, id !== "_None" ? id : null)
                        }}
                    >
                        <option value="_None">{t('common:none')}</option>
                        {folders.map(folder => <option key={folder.id} value={folder.id!}>{folder.name}</option>)}
                    </select>
                </FloatingDropdownRow>
                <Link href={{ pathname: "/composer", query: { songId: data.id } }} style={{ width: '100%' }}>
                    <FloatingDropdownRow style={{ width: '100%' }}>
                        <FaEdit style={{ marginRight: '0.4rem' }} size={14} />
                        <FloatingDropdownText text={t('common:edit_song')} />
                    </FloatingDropdownRow>
                </Link>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.fromStorableSong(data) as RecordedOrComposed
                    downloadSong(song)
                }}>
                    <FaDownload style={{ marginRight: '0.4rem' }} size={14} />
                    <FloatingDropdownText text={t('common:download')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{ marginRight: '0.4rem' }} size={14} />
                    <FloatingDropdownText text={t('common:delete')} />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
        <div style={{
            padding: '0.5rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.4rem'
        }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {data.type === 'composed' ? 'Composed' : 'Recorded'}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                    onClick={async () => {
                        const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
                        playerStore.practice(parsed, 0, parsed.notes.length)
                        toggleMenu(false)
                    }}
                    title={t('practice_mode')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--primary-text)', cursor: 'pointer' }}
                >
                    <FaCrosshairs />
                </button>
                <button
                    onClick={async () => {
                        const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
                        playerStore.approaching(parsed, 0, parsed.notes.length)
                        toggleMenu(false)
                    }}
                    title={t('approach_mode')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--primary-text)', cursor: 'pointer' }}
                >
                    <FaRegCircle />
                </button>
                <button
                    onClick={play}
                    style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-text)',
                        border: 'none',
                        borderRadius: '0.3rem',
                        padding: '0.3rem 0.7rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    Chơi
                </button>
            </div>
        </div>
    </div>
}