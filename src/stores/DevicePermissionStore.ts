import {makeAutoObservable} from "mobx"
import {getDeviceId, getDeviceName} from "$lib/Device/DeviceId"

/**
 * Deny-by-default device permission store.
 * - Starts as notesVisible = false (SCRAMBLED).
 * - Only becomes true when the server returns exactly `true`.
 * - Missing config, error, timeout, null, unexpected shape => stays/returns to false.
 * - Keyed purely on deviceId, never on user/account.
 */

type PermissionStatus = "unchecked" | "loading" | "ready" | "error"

type DevicePermissionState = {
    deviceId: string
    notesVisible: boolean
    status: PermissionStatus
}

const DEVICE_CHECK_TIMEOUT_MS = 6000

class DevicePermissionStore {
    state: DevicePermissionState

    constructor() {
        this.state = {
            deviceId: getDeviceId(),
            notesVisible: false,
            status: "unchecked",
        }
        makeAutoObservable(this)
    }

    setState = (data: Partial<DevicePermissionState>) => {
        this.state = {...this.state, ...data}
    }

    private deny = () => {
        this.setState({notesVisible: false, status: "error"})
    }

    /** Call once on app start. Registers/touches this device and reads its permission in ONE rpc call. */
    init = async () => {
        if (this.state.status === "loading") return
        this.setState({status: "loading"})
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            const {getSupabaseClient} = await import("$lib/Services/SupabaseClient")
            const supabase = getSupabaseClient()
            if (!supabase) return this.deny()

            const timeout = new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), DEVICE_CHECK_TIMEOUT_MS)
            })
            const result: any = await Promise.race([
                Promise.resolve(supabase.rpc("device_check_in", {
                    p_device_id: this.state.deviceId,
                    p_device_name: getDeviceName(),
                })),
                timeout
            ])
            if (!result || result.error) return this.deny()

            // The ONLY path that can ever show original notes:
            this.setState({notesVisible: result.data === true, status: "ready"})
        } catch {
            this.deny()
        } finally {
            if (timer) clearTimeout(timer)
        }
    }
}

export const devicePermissionStore = new DevicePermissionStore()
