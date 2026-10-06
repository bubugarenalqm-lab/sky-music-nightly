import {useEffect, useState} from "react"
import {reaction} from "mobx"
import {devicePermissionStore} from "$stores/DevicePermissionStore"

/** Reactive read of the device permission for function components. Defaults to false (scrambled). */
export function useNotesVisible(): boolean {
    const [visible, setVisible] = useState<boolean>(devicePermissionStore.state.notesVisible === true)
    useEffect(() => {
        return reaction(
            () => devicePermissionStore.state.notesVisible,
            (v) => setVisible(v === true),
            {fireImmediately: true}
        )
    }, [])
    return visible
}
