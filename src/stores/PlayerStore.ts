import {APP_NAME} from "$config";
import {NoteDataState, ObservableNote} from "$lib/audio/Instrument";
import {ComposedSong} from "$lib/Songs/ComposedSong";
import {RecordedSong} from "$lib/Songs/RecordedSong";
import {action, makeObservable, observable} from "mobx";

type eventType = "play" | "practice" | "approaching" | "stop" | "paused"
type SongTypes = RecordedSong | ComposedSong | null
type SongTypesNonNull = RecordedSong | ComposedSong
type ShopSheetMeta = {author: string | null, transcribedBy: string, bpm: number}
type PlayerStoreState = {
    key: number
    song: SongTypes,
    playId: number,
    eventType: eventType,
    start: number,
    end: number,
    shopSheetMeta: ShopSheetMeta | null,
    pausedSong: SongTypesNonNull | null,
    pausedPosition: number,
    pausedEnd: number | undefined,
    pausedShopSheetMeta: ShopSheetMeta | null,
}

class PlayerStore {
    @observable
    state: PlayerStoreState = {
        key: 0,
        song: null,
        playId: 0,
        eventType: 'stop',
        start: 0,
        end: 0,
        shopSheetMeta: null,
        pausedSong: null,
        pausedPosition: 0,
        pausedEnd: undefined,
        pausedShopSheetMeta: null
    }
    @observable
    keyboard: ObservableNote[] = []

    constructor() {
        makeObservable(this)
    }

    get song(): RecordedSong | ComposedSong | null {
        return this.state.song
    }

    get eventType(): eventType {
        return this.state.eventType
    }

    get start(): number {
        return this.state.start
    }

    @action
    setKeyboardLayout = (keyboard: ObservableNote[]) => {
        this.keyboard.splice(0, this.keyboard.length, ...keyboard)
    }
    @action
    resetKeyboardLayout = () => {
        this.keyboard.forEach(note => note.setState({
            status: '',
            delay: APP_NAME === 'Genshin' ? 100 : 200
        }))
    }
    @action
    resetOutgoingAnimation = () => {
        this.keyboard.forEach(n => n.setState({animationId: 0}))
    }
    @action
    setNoteState = (index: number, state: Partial<NoteDataState>) => {
        this.keyboard[index].setState(state)
    }
    @action
    setState = (state: Partial<PlayerStoreState>) => {
        Object.assign(this.state, state)
    }
    play = (song: SongTypesNonNull, start: number = 0, end?: number, shopMeta?: ShopSheetMeta | null) => {
        this.setState({
            song,
            start,
            eventType: 'play',
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1,
            shopSheetMeta: shopMeta ?? null
        })
    }
    practice = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'practice',
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1
        })
    }
    approaching = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'approaching',
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1
        })
    }
    pause = (position: number, end?: number) => {
        const {song, shopSheetMeta} = this.state
        if (!song) return
        this.setState({
            pausedSong: song,
            pausedPosition: position,
            pausedEnd: end,
            pausedShopSheetMeta: shopSheetMeta,
            song: null,
            eventType: 'paused',
            key: this.state.key + 1,
            playId: 0
        })
    }
    resume = () => {
        const {pausedSong, pausedPosition, pausedEnd, pausedShopSheetMeta} = this.state
        if (!pausedSong) return
        this.play(pausedSong, pausedPosition, pausedEnd, pausedShopSheetMeta)
        this.setState({pausedSong: null, pausedPosition: 0, pausedEnd: undefined, pausedShopSheetMeta: null})
    }
    load = (song: SongTypesNonNull, shopMeta?: ShopSheetMeta | null) => {
        this.setState({
            pausedSong: song,
            pausedPosition: 0,
            pausedEnd: undefined,
            pausedShopSheetMeta: shopMeta ?? null,
            song: null,
            shopSheetMeta: null,
            eventType: 'paused',
            key: this.state.key + 1,
            playId: 0
        })
    }
    resetSong = () => {
        this.setState({
            song: null,
            eventType: 'stop',
            start: 0,
            end: 0,
            key: this.state.key + 1,
            playId: 0,
            shopSheetMeta: null,
            pausedSong: null,
            pausedPosition: 0,
            pausedEnd: undefined,
            pausedShopSheetMeta: null
        })
    }
    restartSong = (start: number, end: number) => {
        const {pausedSong} = this.state
        this.setState({
            start,
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1,
            ...(pausedSong ? {pausedPosition: start, pausedEnd: end} : {})
        })
    }
}

export const playerStore = new PlayerStore()