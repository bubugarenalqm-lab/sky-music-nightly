import {
    APP_NAME,
    BASE_PATH,
    BaseNote,
    DO_RE_MI_NOTE_SCALE,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NOTE_SCALE,
    NoteNameType,
    Pitch,
    PITCH_TO_INDEX
} from "$config"
import {makeObservable, observable} from "mobx"
import {InstrumentName, NoteStatus} from "$types/GeneralTypes"
import {capitalize, getPitchChanger} from "../utils/Utilities"
import {NoteImage} from "$cmp/shared/SvgNotes"
import {
    getInstrumentNoteFiles,
    getInstrumentSampleMeta,
    getInstrumentSustain,
    InstrumentSustain,
    resolveInstrumentVariant,
    SustainLoopMode
} from "./instrumentSamples"
import {Voice} from "./Voice"
import {crossfadeLoopRegion, DEFAULT_LOOP_CROSSFADE_S} from "./loopCrossfade"
import {trimSilentTail} from "./trimSilentTail"
import {KeyboardProvider} from "$lib/Providers/KeyboardProvider";
import {KeyboardCode} from "$lib/Providers/KeyboardProvider/KeyboardTypes";
import {keyBinds} from "$stores/KeybindsStore";
import {DEFAULT_ENG_KEYBOARD_MAP} from "$i18n/i18n";

type Layouts = {
    keyboard: string[]
    abc: string[]
    number: string[]
    playstation: string[]
    switch: string[]
}
//Keyed by instrument AND variant: two layers on the same instrument with different variants (Aurora) load different
//samples, a pool keyed by name alone would hand both of them whichever one decoded first.
const INSTRUMENT_BUFFER_POOL = new Map<string, AudioBuffer[]>()

/**
 * The gain of an instrument at 100% volume. A little under unity: chords sum, so every instrument keeps some headroom
 * of its own and the master bus (MasterBus.ts) limits whatever still piles up past it.
 */
const FULL_VOLUME_GAIN = 0.9
//a sustained instrument never has more voices sounding than this, the oldest ones are cut first
const MAX_VOICES = 64

//TODO refactor everything here


export class Instrument {
    name: InstrumentName
    volumeNode: GainNode | null = null
    instrumentData: typeof INSTRUMENTS_DATA[InstrumentName]
    notes: ObservableNote[] = []
    layouts: Layouts = {
        keyboard: [],
        abc: [],
        playstation: [],
        number: [],
        switch: []
    }
    buffers: AudioBuffer[] = []
    isDeleted: boolean = false
    isLoaded: boolean = false
    audioContext: AudioContext | null = null
    /** The recording of the whole instrument this layer plays (Aurora has several), undefined if it has none */
    variant: string | undefined
    private activeVoices: Voice[] = []
    //the voice held down on every note, from pressNote() to releaseNote()
    private heldVoices = new Map<number, Voice>()
    //the last voice started right now (not scheduled ahead) on every note: a new one on the same note chokes it
    private lastLiveVoices = new Map<number, Voice>()

    get endNode() {
        return this.volumeNode
    }

    static clearPool() {
        INSTRUMENT_BUFFER_POOL.clear()
    }

    /** Whether this engine already plays what a layer asks for: the same instrument AND the same variant of it. */
    isSameAs = (name: InstrumentName, variant?: string | null) => {
        return this.name === name && this.variant === resolveInstrumentVariant(name, variant)
    }

    /** What makes two engines interchangeable: the name plus the variant. */
    get identityKey() {
        return `${this.name}:${this.variant ?? ''}`
    }

    /** The sustain config of this instrument, null when its notes are plain one-shots. */
    get sustainConfig() {
        return getInstrumentSustain(this.name)
    }

    /** Whether the notes of this instrument respond to how long they are held. */
    get supportsSustain() {
        return this.sustainConfig !== null
    }

    constructor(name: InstrumentName = INSTRUMENTS[0], variant?: string | null) {
        this.name = name
        if (!INSTRUMENTS.includes(this.name as any)) this.name = INSTRUMENTS[0]
        this.variant = resolveInstrumentVariant(this.name, variant)
        const noteFiles = getInstrumentNoteFiles(this.name, this.variant)
        this.instrumentData = {...INSTRUMENTS_DATA[this.name as keyof typeof INSTRUMENTS_DATA]}
        const layouts = this.instrumentData.layout
        this.layouts = {
            keyboard: [...layouts.keyboardLayout],
            abc: [...layouts.abcLayout],
            playstation: [...layouts.playstationLayout],
            number: [...layouts.numberLayout],
            switch: [...layouts.switchLayout]
        }
        for (let i = 0; i < this.instrumentData.notes; i++) {
            const noteName = this.layouts.keyboard[i]
            const noteNames = {
                keyboard: noteName,
            }
            const file = noteFiles?.[i] ?? `${i}.mp3`
            const url = `${BASE_PATH}/assets/audio/${APP_NAME.toLowerCase()}/${this.name}/${file}`
            const note = new ObservableNote(i, noteNames, url, this.instrumentData.baseNotes[i], this.instrumentData.midiNotes[i] ?? 0)
            note.instrument = this.name
            note.noteImage = this.instrumentData.icons[i]
            this.notes.push(note)
        }
    }

    getNoteFromCode = (code: string) => {
        const index = this.getNoteIndexFromCode(code)
        return index !== -1 ? this.notes[index] : null
    }
    getNoteFromIndex = (index: number) => {
        return this.notes[index] ?? null
    }
    getNoteIndexFromCode = (code: string) => {
        return this.layouts.keyboard.findIndex(e => e === code)
    }
    getNoteText = (index: number, type: NoteNameType, pitch: Pitch) => {
        const layout = this.layouts
        try {
            if (type === "Note name") {
                const baseNote = this.notes[index].baseNote
                return NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0]
            }
            if (type === "Your Keyboard layout") {
                const key = keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index]
                const res = KeyboardProvider.getTextOfCode(key as KeyboardCode) ?? key.replace('Key', '')
                return capitalize(res)
            }
            if(type === "Sky keyboard layout"){
                const key = keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index]
                const res = DEFAULT_ENG_KEYBOARD_MAP[key] ?? key.replace('Key', '')
                return capitalize(res)
            }
            if (type === "Do Re Mi") {
                const baseNote = this.notes[index].baseNote
                return DO_RE_MI_NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0]
            }
            if (type === "ABC") return layout.abc[index]
            if (type === "1 2 3") return layout.number[index]
            if (type === "No Text") return ''
            if (type === "Playstation") return layout.playstation[index]
            if (type === "Switch") return layout.switch[index]
        } catch (e) {
        }
        return ''
    }
    changeVolume = (amount: number) => {
        let newVolume = Number(((amount / 100) * FULL_VOLUME_GAIN).toFixed(3))
        if (amount < 5) newVolume = 0
        if (this.volumeNode) this.volumeNode.gain.value = newVolume
    }

    /** The minimum time (ms) a triggered note sounds before its release starts: a very fast tap still plays this much. */
    private minNoteMs = (note: number): number => {
        const sustain = this.sustainConfig
        if (!sustain) return 0
        const min = getInstrumentSampleMeta(this.name)?.noteMinLengths?.[note] ?? sustain.minLength
        return typeof min === 'number' && Number.isFinite(min) && min > 0 ? min * 1000 : 0
    }

    /**
     * Plays a note.
     * - A plain instrument plays the sample once.
     * - A sustained instrument plays it for `sustainMs` (until the next note of the song, for example) and then fades
     *   out over its release. Without `sustainMs` the note is a tap: it sounds for the instrument's minimum length.
     * `delay` is in seconds from now.
     */
    play = (note: number, pitch: Pitch, delay?: number, sustainMs?: number) => {
        if (this.isDeleted || !this.volumeNode || !this.audioContext) return
        if (this.supportsSustain) {
            this.startVoice(note, pitch, delay, sustainMs && sustainMs > 0 ? sustainMs : 0)
            return
        }
        const pitchChanger = getPitchChanger(pitch)
        const player = this.audioContext.createBufferSource()
        player.buffer = this.buffers[note]
        player.connect(this.volumeNode)
        //player.detune.value = pitch * 100, pitch should be 0 indexed from C
        player.playbackRate.value = pitchChanger
        if (delay) {
            player.start(this.audioContext.currentTime + delay)
        } else {
            player.start()
        }

        function handleEnd() {
            player.stop()
            player.disconnect()
        }

        player.addEventListener('ended', handleEnd, {once: true})
    }

    /**
     * Presses a note of a sustained instrument and holds it until releaseNote(). For a plain instrument this is
     * just play(). Meant for a key or a finger that stays down.
     */
    pressNote = (note: number, pitch: Pitch) => {
        if (!this.supportsSustain) return this.play(note, pitch)
        if (this.isDeleted || !this.volumeNode || !this.audioContext) return
        this.startVoice(note, pitch, undefined, undefined)
    }

    /** Lets go of a note held with pressNote(): it still sounds for its minimum length, then fades out. */
    releaseNote = (note: number) => {
        const voice = this.heldVoices.get(note)
        if (!voice) return
        this.heldVoices.delete(note)
        voice.releaseAt(voice.startedAt + this.minNoteMs(note) / 1000)
    }

    /** Releases every note held with pressNote(), the guard against a key-up the page never got (blur). */
    releaseHeldNotes = () => {
        this.heldVoices.forEach((voice, note) => voice.releaseAt(voice.startedAt + this.minNoteMs(note) / 1000))
        this.heldVoices.clear()
    }

    /** Fades out (or, with `hard`, cuts) everything sounding: the end of a song, or a disposed instrument. */
    releaseAllNotes = (hard = false) => {
        this.heldVoices.clear()
        this.lastLiveVoices.clear()
        const voices = this.activeVoices
        this.activeVoices = []
        voices.forEach(voice => hard ? voice.stop() : voice.fadeOut())
    }

    /**
     * Starts a voice of a sustained instrument. `durationMs`: how long it is held, 0 for a tap, undefined to hold it
     * until releaseNote().
     */
    private startVoice = (note: number, pitch: Pitch, delay: number | undefined, durationMs: number | undefined) => {
        const sustain = this.sustainConfig
        const buffer = this.buffers[note]
        if (!sustain || !buffer || !this.audioContext || !this.volumeNode) return
        const context = this.audioContext
        const now = context.currentTime
        const at = delay ? now + delay : undefined
        const scheduledAhead = at !== undefined && at > now
        //same note again right now: choke the previous one quickly instead of layering its release under the new attack.
        //A note scheduled ahead (song playback) must not choke what is being heard now merely because it was scheduled early
        if (!scheduledAhead) {
            const previous = this.lastLiveVoices.get(note)
            if (previous && !previous.isDisposed) previous.choke()
        }
        this.activeVoices = this.activeVoices.filter(voice => !voice.isDisposed)
        if (!scheduledAhead) {
            let sounding = this.activeVoices.reduce((count, voice) => count + (voice.startedAt <= now ? 1 : 0), 0)
            while (sounding >= MAX_VOICES) {
                //oldest first keeps the newest notes audible
                const oldest = this.activeVoices.findIndex(voice => voice.startedAt <= now)
                if (oldest === -1) break
                this.activeVoices[oldest].stop()
                sounding--
            }
        }
        const meta = getInstrumentSampleMeta(this.name)
        const voice = new Voice({
            context,
            buffer,
            destination: this.volumeNode,
            playbackRate: getPitchChanger(pitch),
            loop: meta?.noteLoops?.[note] ?? sustain.loop,
            loopMode: sustain.loopMode as Exclude<SustainLoopMode, 'one-shot'>,
            release: sustain.release,
            crossfade: sustain.crossfade,
            at,
            onDispose: this.forgetVoice
        })
        this.activeVoices.push(voice)
        if (!scheduledAhead) this.lastLiveVoices.set(note, voice)
        if (durationMs === undefined) {
            const previousHeld = this.heldVoices.get(note)
            if (previousHeld && previousHeld !== voice) previousHeld.releaseAt(previousHeld.startedAt)
            this.heldVoices.set(note, voice)
            return
        }
        //a note always sounds at least its minimum length from its own start
        voice.releaseAt(voice.startedAt + Math.max(durationMs, this.minNoteMs(note)) / 1000)
    }

    private forgetVoice = (voice: Voice) => {
        const index = this.activeVoices.indexOf(voice)
        if (index !== -1) this.activeVoices.splice(index, 1)
        for (const [note, held] of this.heldVoices) if (held === voice) this.heldVoices.delete(note)
        for (const [note, last] of this.lastLiveVoices) if (last === voice) this.lastLiveVoices.delete(note)
    }

    /** Bakes the loop-boundary crossfade of every looped note into its decoded buffer (see loopCrossfade.ts). */
    private renderLoopCrossfades = () => {
        const sustain: InstrumentSustain | null = this.sustainConfig
        if (!sustain) return
        const meta = getInstrumentSampleMeta(this.name)
        const seconds = sustain.loopCrossfade ?? DEFAULT_LOOP_CROSSFADE_S
        this.buffers.forEach((buffer, index) => {
            const loop = meta?.noteLoops?.[index] ?? sustain.loop
            if (!loop || !buffer) return
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                crossfadeLoopRegion(buffer.getChannelData(channel), buffer.sampleRate, loop, seconds)
            }
        })
    }

    /**
     * Cuts the inaudible tail off every one-shot sample (see trimSilentTail.ts), which a sounding source otherwise keeps
     * paying CPU for. A sustained instrument is left whole: its tail is the release a Voice plays out.
     */
    private trimSilentTails = (audioContext: AudioContext) => {
        if (this.sustainConfig) return
        this.buffers = this.buffers.map(buffer => {
            const channels = Array.from({length: buffer.numberOfChannels}, (_, channel) => buffer.getChannelData(channel))
            const length = trimSilentTail(channels, buffer.sampleRate)
            if (length === null) return buffer
            const trimmed = audioContext.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
            channels.forEach((data, channel) => trimmed.getChannelData(channel).set(data.subarray(0, length)))
            return trimmed
        })
    }

    load = async (audioContext: AudioContext) => {
        this.audioContext = audioContext
        this.volumeNode = audioContext.createGain()
        this.volumeNode.gain.value = FULL_VOLUME_GAIN
        let loadedCorrectly = true
        const key = this.identityKey
        if (!INSTRUMENT_BUFFER_POOL.has(key)) {
            const emptyBuffer = this.audioContext.createBuffer(2, this.audioContext.sampleRate, this.audioContext.sampleRate)
            const requests: Promise<AudioBuffer>[] = this.notes.map(note =>
                fetchAudioBuffer(note.url, audioContext)
                    .catch(() => {
                        loadedCorrectly = false
                        return emptyBuffer
                    })
            )
            this.buffers = await Promise.all(requests)
            //once per decode and BEFORE pooling: a pool hit must reuse the processed buffers, never blend them again
            this.renderLoopCrossfades()
            this.trimSilentTails(audioContext)
            if (loadedCorrectly) INSTRUMENT_BUFFER_POOL.set(key, this.buffers)
        } else {
            this.buffers = INSTRUMENT_BUFFER_POOL.get(key)!
        }
        this.isLoaded = true
        return loadedCorrectly
    }
    disconnect = (node?: AudioNode) => {
        if (node) return this.volumeNode?.disconnect(node)
        this.volumeNode?.disconnect()
    }
    connect = (node: AudioNode) => {
        this.volumeNode?.connect(node)
    }
    dispose = () => {
        this.releaseAllNotes(true)
        this.disconnect()
        this.isDeleted = true
        this.buffers = []
        this.volumeNode = null
    }
}

export function fetchAudioBuffer(url: string, audioContext: AudioContext): Promise<AudioBuffer> {
    //dont change any of this, safari bug
    return new Promise((res, rej) => {
        fetch(url)
            .then(result => result.arrayBuffer())
            .then(buffer => {
                audioContext.decodeAudioData(buffer, res, (e) => {
                    console.error(e)
                    rej()
                }).catch(e => {
                    console.error(e)
                    rej()
                })
            })
    })
}

interface NoteName {
    keyboard: string,
}

export type NoteDataState = {
    status: NoteStatus,
    delay: number
    animationId: number
    layer: number
}

export class ObservableNote {
    index: number
    noteImage: NoteImage = APP_NAME === "Genshin" ? "do" : "cr"
    midiNote: number
    instrument: InstrumentName = INSTRUMENTS[0]
    noteNames: NoteName
    url: string
    baseNote: BaseNote = "C"
    buffer: ArrayBuffer = new ArrayBuffer(8)
    @observable
    readonly data: NoteDataState = {
        status: '',
        delay: 0,
        animationId: 0,
        layer: 0
    }

    constructor(index: number, noteNames: NoteName, url: string, baseNote: BaseNote, midiNote: number) {
        this.index = index
        this.noteNames = noteNames
        this.url = url
        this.baseNote = baseNote
        this.midiNote = midiNote
        makeObservable(this)
    }

    get status(): NoteStatus {
        return this.data.status
    }

    setStatus(status: NoteStatus) {
        return this.setState({status})
    }

    triggerAnimation(status?: NoteStatus) {
        this.setState({
            animationId: this.data.animationId + 1,
            status
        })
    }

    setState(data: Partial<NoteDataState>) {
        Object.assign(this.data, data)
    }

    clone() {
        const obj = new ObservableNote(this.index, this.noteNames, this.url, this.baseNote, this.midiNote)
        obj.buffer = this.buffer
        obj.noteImage = this.noteImage
        obj.instrument = this.instrument
        obj.setState(this.data)
        return obj
    }
}
