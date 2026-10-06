/**
 * Marks songs that come from the Sheet Library (shop sheets).
 * The flag lives in song.data, so it survives clone/serialize/save/import.
 * Songs without the flag (own compositions, imported files) are NEVER scrambled.
 */
type WithSongData = { data: { isLibrarySheet?: boolean } }

export type ScrambleSongLike = {
    id: string | null
    name: string
    data: { isLibrarySheet?: boolean }
}

export function markLibrarySheet<T extends WithSongData>(song: T): T {
    song.data.isLibrarySheet = true
    return song
}

export function isLibrarySheet(song: WithSongData | null | undefined): boolean {
    return song?.data?.isLibrarySheet === true
}

/** Same key everywhere (canvas, composer keyboard, player) so the mapping is consistent. */
export function getSheetKey(song: { id: string | null, name: string }): string {
    return song.id ?? song.name
}

/**
 * true  -> draw/show the REAL notes
 * false -> draw/show scrambled notes
 * Library sheets show real notes only if the device permission is exactly true.
 */
export function showRealNotes(song: WithSongData | null | undefined, permissionVisible: boolean): boolean {
    return permissionVisible === true || !isLibrarySheet(song)
}
