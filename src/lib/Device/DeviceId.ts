/**
 * Stable per-device identifier.
 *
 * - Generated once, stored in localStorage, never regenerated on reload.
 * - Not tied to user/account (email, userId, username) in any way.
 * - If localStorage is unavailable (e.g. private mode, SSR), falls back to an
 *   in-memory id for the lifetime of the tab. This never gets written to
 *   localStorage later, so it's intentionally impossible to accidentally merge
 *   two different "sessions" worth of permissions.
 */

const STORAGE_KEY = "sky_device_id"

let memoryFallbackId: string | null = null

function generateUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }
    // RFC4122-ish fallback for older browsers/webviews without crypto.randomUUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

function safeLocalStorageGet(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeLocalStorageSet(key: string, value: string): boolean {
    try {
        window.localStorage.setItem(key, value)
        return true
    } catch {
        return false
    }
}

/**
 * Returns the stable deviceId for this browser/device.
 * Safe to call multiple times; always returns the same value for the same device.
 */
export function getDeviceId(): string {
    if (memoryFallbackId) return memoryFallbackId

    if (typeof window === "undefined") {
        // SSR / non-browser context: never persist, caller should treat as untrusted
        return "ssr-unknown-device"
    }

    const existing = safeLocalStorageGet(STORAGE_KEY)
    if (existing) return existing

    const created = generateUuid()
    const persisted = safeLocalStorageSet(STORAGE_KEY, created)
    if (!persisted) {
        // localStorage blocked: keep stable for this tab session only,
        // but do NOT silently claim a previously-granted permission.
        memoryFallbackId = created
    }
    return created
}

/**
 * Optional human-readable label for Device Management UI only.
 * Never used for permission checks.
 */
const NAME_STORAGE_KEY = "sky_device_name"

export function getDeviceName(): string | null {
    return safeLocalStorageGet(NAME_STORAGE_KEY)
}

export function setDeviceName(name: string): void {
    safeLocalStorageSet(NAME_STORAGE_KEY, name.slice(0, 64))
}
