import {useCallback, useEffect, useState} from "react"
import Head from "next/head"
import type {SupabaseClient} from "@supabase/supabase-js"
import {getSupabaseClient} from "$lib/Services/SupabaseClient"
import {getDeviceId} from "$lib/Device/DeviceId"

type DeviceRow = {
    device_id: string
    device_name: string | null
    notes_visible: boolean
    created_at: string
    last_seen: string
}

type AuthState = "loading" | "signed-out" | "not-admin" | "admin"

const ONLINE_WINDOW_MS = 5 * 60 * 1000

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60 * 1000) return "Now"
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

const cell: React.CSSProperties = {padding: "8px 10px", textAlign: "left", borderBottom: "1px solid rgba(128,128,128,0.3)"}
const input: React.CSSProperties = {padding: "8px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.5)", background: "transparent", color: "inherit"}
const btn: React.CSSProperties = {padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.5)", background: "transparent", color: "inherit", cursor: "pointer"}

export default function AdminDevicesPage() {
    const [auth, setAuth] = useState<AuthState>("loading")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [devices, setDevices] = useState<DeviceRow[]>([])
    const [error, setError] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [filter, setFilter] = useState("")
    const [thisDeviceId, setThisDeviceId] = useState("")

    const loadDevices = useCallback(async (client: SupabaseClient) => {
        const {data, error} = await client.rpc("admin_list_devices")
        if (error) {
            setError(error.message)
            return
        }
        setError(null)
        setDevices((data ?? []) as DeviceRow[])
    }, [])

    const checkAdmin = useCallback(async (client: SupabaseClient) => {
        const {data: sessionData} = await client.auth.getSession()
        if (!sessionData.session) {
            setAuth("signed-out")
            return
        }
        const {data, error} = await client.rpc("is_device_admin")
        if (error || data !== true) {
            setAuth("not-admin")
            return
        }
        setAuth("admin")
        await loadDevices(client)
    }, [loadDevices])

    useEffect(() => {
        setThisDeviceId(getDeviceId())
        const client = getSupabaseClient()
        if (!client) {
            setError("Supabase chua duoc cau hinh (thieu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).")
            setAuth("signed-out")
            return
        }
        checkAdmin(client)
    }, [checkAdmin])

    useEffect(() => {
        if (auth !== "admin") return
        const client = getSupabaseClient()
        if (!client) return
        const id = setInterval(() => loadDevices(client), 15000)
        return () => clearInterval(id)
    }, [auth, loadDevices])

    async function signIn() {
        const client = getSupabaseClient()
        if (!client) return
        setError(null)
        const {error} = await client.auth.signInWithPassword({email, password})
        if (error) {
            setError(error.message)
            return
        }
        setPassword("")
        await checkAdmin(client)
    }

    async function signOut() {
        const client = getSupabaseClient()
        if (!client) return
        await client.auth.signOut()
        setDevices([])
        setAuth("signed-out")
    }

    async function run(deviceId: string, fn: (client: SupabaseClient) => PromiseLike<{error: {message: string} | null}>) {
        const client = getSupabaseClient()
        if (!client) return
        setBusyId(deviceId)
        const {error} = await fn(client)
        if (error) setError(error.message)
        await loadDevices(client)
        setBusyId(null)
    }

    const toggle = (row: DeviceRow) =>
        run(row.device_id, c => c.rpc("admin_set_notes_visible", {p_device_id: row.device_id, p_visible: !row.notes_visible}))

    const rename = (row: DeviceRow) => {
        const name = window.prompt("Ten thiet bi:", row.device_name ?? "")
        if (name === null) return
        run(row.device_id, c => c.rpc("admin_rename_device", {p_device_id: row.device_id, p_name: name}))
    }

    const remove = (row: DeviceRow) => {
        if (!window.confirm(`Xoa thiet bi "${row.device_name ?? row.device_id}"? Neu thiet bi do mo web lai, no se tu dang ky lai voi quyen OFF.`)) return
        run(row.device_id, c => c.rpc("admin_delete_device", {p_device_id: row.device_id}))
    }

    const visibleRows = devices.filter(d => {
        const q = filter.trim().toLowerCase()
        if (!q) return true
        return d.device_id.toLowerCase().includes(q) || (d.device_name ?? "").toLowerCase().includes(q)
    })

    return <div style={{maxWidth: 900, margin: "0 auto", padding: "1.5rem", overflowY: "auto", height: "100vh"}}>
        <Head>
            <meta name="robots" content="noindex,nofollow"/>
            <title>Device Management</title>
        </Head>
        <h2>Device Management</h2>

        {error && <p style={{color: "#e55"}}>{error}</p>}

        {auth === "loading" && <p>Dang tai...</p>}

        {auth === "signed-out" && <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
            <input style={input} type="email" placeholder="Email admin" value={email}
                   onChange={e => setEmail(e.target.value)}/>
            <input style={input} type="password" placeholder="Mat khau" value={password}
                   onChange={e => setPassword(e.target.value)}
                   onKeyDown={e => {
                       if (e.key === "Enter") signIn()
                   }}/>
            <button style={btn} onClick={signIn}>Dang nhap</button>
        </div>}

        {auth === "not-admin" && <div>
            <p>Tai khoan nay khong co quyen admin.</p>
            <button style={btn} onClick={signOut}>Dang xuat</button>
        </div>}

        {auth === "admin" && <>
            <div style={{display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap"}}>
                <input style={{...input, flex: 1, minWidth: 180}} placeholder="Tim theo ten hoac ID"
                       value={filter} onChange={e => setFilter(e.target.value)}/>
                <button style={btn} onClick={() => {
                    const c = getSupabaseClient()
                    if (c) loadDevices(c)
                }}>Lam moi
                </button>
                <button style={btn} onClick={signOut}>Dang xuat</button>
            </div>
            <div style={{overflowX: "auto"}}>
                <table style={{width: "100%", borderCollapse: "collapse"}}>
                    <thead>
                    <tr>
                        <th style={cell}>Device</th>
                        <th style={cell}>Status</th>
                        <th style={cell}>Last Seen</th>
                        <th style={cell}>View Notes</th>
                        <th style={cell}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {visibleRows.map(d => {
                        const online = Date.now() - new Date(d.last_seen).getTime() < ONLINE_WINDOW_MS
                        const isThis = d.device_id === thisDeviceId
                        return <tr key={d.device_id}>
                            <td style={cell}>
                                <div>{d.device_name || "(chua dat ten)"}{isThis ? "  (may nay)" : ""}</div>
                                <div style={{fontSize: 12, opacity: 0.6}} title={d.device_id}>{d.device_id.slice(0, 8)}...</div>
                            </td>
                            <td style={cell}>{online ? "Online" : "Offline"}</td>
                            <td style={cell}>{timeAgo(d.last_seen)}</td>
                            <td style={cell}>
                                <button style={{...btn, fontWeight: 700, opacity: busyId === d.device_id ? 0.5 : 1}}
                                        disabled={busyId === d.device_id}
                                        onClick={() => toggle(d)}>
                                    {d.notes_visible ? "ON" : "OFF"}
                                </button>
                            </td>
                            <td style={cell}>
                                <button style={btn} onClick={() => rename(d)}>Doi ten</button>
                                {" "}
                                <button style={btn} onClick={() => remove(d)}>Xoa</button>
                            </td>
                        </tr>
                    })}
                    {visibleRows.length === 0 && <tr><td style={cell} colSpan={5}>Khong co thiet bi nao.</td></tr>}
                    </tbody>
                </table>
            </div>
            <p style={{fontSize: 12, opacity: 0.6}}>
                Online = last seen trong 5 phut. last_seen chi cap nhat luc thiet bi mo web.
            </p>
        </>}
    </div>
}
