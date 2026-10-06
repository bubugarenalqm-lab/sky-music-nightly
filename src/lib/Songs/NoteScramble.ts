/**
 * Deterministic, non-mutating pitch/position scrambling for DISPLAY ONLY.
 *
 * - Never mutates sheet data, never uses Math.random().
 * - Same (deviceId, sheetId, size) always gives the same mapping.
 * - The mapping is a single cycle (Sattolo), so NO position maps to itself:
 *   every displayed note is guaranteed to be drawn away from its real row.
 * - Callers must only use the result to choose where to draw a note.
 */

// cyrb53-style string hash
function hashSeed(str: string): number {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

// mulberry32 seeded PRNG
function mulberry32(seed: number) {
    let a = seed
    return function () {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function buildPermutation(seedStr: string, size: number): number[] {
    const rng = mulberry32(hashSeed(seedStr) % 2147483647)
    const arr = Array.from({length: size}, (_, i) => i)
    // Sattolo's algorithm: j in [0, i-1] (strictly below i) => one n-cycle, no fixed points
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * i)
        const tmp = arr[i]
        arr[i] = arr[j]
        arr[j] = tmp
    }
    return arr
}

const permutationCache = new Map<string, readonly number[]>()

/**
 * Returns the display-index lookup table: displayIndex = table[realIndex].
 * Pure perf cache; same inputs always rebuild the same table.
 */
export function getScramblePermutation(deviceId: string, sheetId: string, size: number): readonly number[] {
    const key = `${deviceId}::${sheetId || "unknown-sheet"}::${size}`
    let perm = permutationCache.get(key)
    if (!perm) {
        perm = Object.freeze(buildPermutation(key, size))
        permutationCache.set(key, perm)
    }
    return perm
}

export function getDisplayIndex(opts: {
    realIndex: number
    size: number
    sheetId: string
    deviceId: string
    notesVisible: boolean
}): number {
    const {realIndex, size, sheetId, deviceId, notesVisible} = opts
    if (notesVisible) return realIndex
    if (realIndex < 0 || realIndex >= size) return realIndex
    return getScramblePermutation(deviceId, sheetId, size)[realIndex]
}

const inverseCache = new Map<string, readonly number[]>()

/**
 * Inverse lookup: realIndex = inverse[displayIndex].
 * Used to answer "which REAL note is drawn/lit at this visual slot?".
 */
export function getInversePermutation(deviceId: string, sheetId: string, size: number): readonly number[] {
    const key = `${deviceId}::${sheetId || "unknown-sheet"}::${size}`
    let inv = inverseCache.get(key)
    if (!inv) {
        const perm = getScramblePermutation(deviceId, sheetId, size)
        const arr = new Array<number>(size)
        perm.forEach((display, real) => {
            arr[display] = real
        })
        inv = Object.freeze(arr)
        inverseCache.set(key, inv)
    }
    return inv
}
