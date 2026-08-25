import {useState} from 'react'
import {FaSpinner, FaMusic} from 'react-icons/fa'
import {logger} from '$stores/LoggerStore'
import {songService} from '$lib/Services/SongService'
import {fetchShopSheetData, ShopSheetListItem} from '$lib/Services/SupabaseService'
import type {Theme} from '$stores/ThemeStore/ThemeProvider'
interface ShopSheetRowProps {
    data: ShopSheetListItem
    theme: Theme
    onLoad: (song: any) => void
    isSelected: boolean
}
export default function ShopSheetRow({data, theme, onLoad, isSelected}: ShopSheetRowProps) {
    const [fetching, setFetching] = useState(false)
    const load = async function () {
        if (fetching) return
        try {
            setFetching(true)
            const row = await fetchShopSheetData(data.id)
            setFetching(false)
            if (!row) return logger.error('Song not found')
            const parsed = songService.parseSong(row.data)
            onLoad(parsed)
        } catch (e) {
            setFetching(false)
            console.error(e)
            logger.error('Error loading song')
        }
    }
    return <div className={`shop-sheet-row ${isSelected ? 'selected' : ''}`} onClick={load}>
        {fetching ? <FaSpinner className='spin'/> : <FaMusic/>}
        <span>{data.name}</span>
        {data.author && <span style={{opacity: 0.7, fontSize: '0.8rem'}}>- {data.author}</span>}
    </div>
}
