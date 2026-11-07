// Sample metadata of the instruments that need more than "note N is N.mp3, play it once":
// sustained instruments (held notes that fade out on release, optionally with a loop region), instruments
// whose samples are not numbered (NightwindHorn, Vodyanitsa) and instruments with several recordings
// (Aurora's variants).
//
// GENERATED from the instrument meta.json files of Specy/genshin-music (src/lib/games/<game>/instruments).
// Everything not listed here is a plain one-shot instrument whose notes are `<index>.mp3`.
// Times are in seconds.

import {APP_NAME} from "$config"

export type LoopRegion = { start: number, end: number }

/**
 * What note-off does:
 * - 'loop-continuous': keep looping (or, without a loop region, keep ringing) and fade out over `release`
 * - 'loop-sustain': stop looping and play out the rest of the sample from the exact playhead position
 * - 'one-shot': ignore note-off, play the whole sample (same as having no sustain at all)
 */
export type SustainLoopMode = 'loop-continuous' | 'loop-sustain' | 'one-shot'

export type InstrumentSustain = {
    /** fade-out length after note-off */
    release: number
    /** sustain-to-tail crossfade of the 'loop-sustain' mode (default 0.02) */
    crossfade?: number
    /** crossfade baked into the loop boundary when the buffer is decoded (default 0.05, 0 disables) */
    loopCrossfade?: number
    loopMode: SustainLoopMode
    /** a note always sounds at least this long before its release starts, however short the tap */
    minLength?: number
    /** default loop region of every note that has no loop of its own */
    loop?: LoopRegion
}

export type InstrumentVariant = {
    default: string
    options: Record<string, { label: string, files: string[] }>
}

export type InstrumentSampleMeta = {
    sustain?: InstrumentSustain
    /** sample file of every note, only when they are not `<index>.mp3` */
    files?: string[]
    /** loop region of every note (overrides sustain.loop) */
    noteLoops?: (LoopRegion | null)[]
    /** minLength of every note (overrides sustain.minLength) */
    noteMinLengths?: (number | null)[]
    variant?: InstrumentVariant
}

export const INSTRUMENT_SAMPLE_META: Record<"sky" | "genshin", Record<string, InstrumentSampleMeta>> = {
    "sky": {
        "Aurora": {
            "sustain": {
                "release": 0.4,
                "loopMode": "loop-continuous",
                "minLength": 0.15
            },
            "variant": {
                "default": "ah",
                "options": {
                    "ah": {
                        "label": "Ah",
                        "files": [
                            "C4-C.mp3",
                            "D4-B.mp3",
                            "E4-C.mp3",
                            "F4-A.mp3",
                            "G4-A.mp3",
                            "A4-A.mp3",
                            "B4-C.mp3",
                            "C5-A.mp3",
                            "D5-C.mp3",
                            "E5-B.mp3",
                            "F5-A.mp3",
                            "G5-A.mp3",
                            "A5-B.mp3",
                            "B5-A.mp3",
                            "C6-A.mp3"
                        ]
                    },
                    "eh": {
                        "label": "Eh",
                        "files": [
                            "C4-B.mp3",
                            "D4-A.mp3",
                            "E4-B.mp3",
                            "F4-B.mp3",
                            "G4-B.mp3",
                            "A4-D.mp3",
                            "B4-A.mp3",
                            "C5-C.mp3",
                            "D5-D.mp3",
                            "E5-E.mp3",
                            "F5-B.mp3",
                            "G5-B.mp3",
                            "A5-A.mp3",
                            "B5-A.mp3",
                            "C6-A.mp3"
                        ]
                    },
                    "oo": {
                        "label": "Oo",
                        "files": [
                            "C4-C.mp3",
                            "D4-C.mp3",
                            "E4-A.mp3",
                            "F4-B.mp3",
                            "G4-A.mp3",
                            "A4-B.mp3",
                            "B4-B.mp3",
                            "C5-A.mp3",
                            "D5-A.mp3",
                            "E5-B.mp3",
                            "F5-B.mp3",
                            "G5-B.mp3",
                            "A5-A.mp3",
                            "B5-A.mp3",
                            "C6-A.mp3"
                        ]
                    }
                }
            }
        },
        "Cello": {
            "sustain": {
                "release": 0.3,
                "loopMode": "loop-continuous",
                "loopCrossfade": 0.08,
                "minLength": 0.25
            },
            "noteLoops": [
                {
                    "start": 1.316893,
                    "end": 6.945374
                },
                {
                    "start": 2.047982,
                    "end": 5.823878
                },
                {
                    "start": 1.586145,
                    "end": 4.730658
                },
                {
                    "start": 2.07932,
                    "end": 6.3861
                },
                {
                    "start": 1.20161,
                    "end": 4.66068
                },
                {
                    "start": 2.081111,
                    "end": 6.59288
                },
                {
                    "start": 2.174354,
                    "end": 5.465873
                },
                {
                    "start": 0.959569,
                    "end": 7.879841
                },
                {
                    "start": 2.019206,
                    "end": 5.836417
                },
                {
                    "start": 0.93839,
                    "end": 5.159524
                },
                {
                    "start": 1.846032,
                    "end": 4.830068
                },
                {
                    "start": 1.530317,
                    "end": 6.591746
                },
                {
                    "start": 2.061814,
                    "end": 4.58839
                },
                {
                    "start": 1.867506,
                    "end": 5.170454
                },
                {
                    "start": 2.462744,
                    "end": 5.902925
                }
            ]
        },
        "Harmonica": {
            "sustain": {
                "release": 0.28,
                "loopMode": "loop-continuous",
                "minLength": 0.15
            }
        },
        "KrillHorn": {
            "sustain": {
                "release": 0.3,
                "loopMode": "loop-continuous",
                "minLength": 0.2
            }
        },
        "LightGuitar": {
            "sustain": {
                "release": 0.35,
                "loopMode": "loop-continuous",
                "minLength": 0.1
            }
        },
        "Saxophone": {
            "sustain": {
                "release": 0.28,
                "loopMode": "loop-continuous",
                "minLength": 0.15
            }
        },
        "TransverseFlute": {
            "sustain": {
                "release": 0.28,
                "loopMode": "loop-continuous",
                "minLength": 0.15
            }
        },
        "Violin": {
            "sustain": {
                "release": 0.32,
                "loopMode": "loop-continuous",
                "minLength": 0.2
            }
        }
    },
    "genshin": {
        "HarmonicKey": {
            "sustain": {
                "release": 0.5,
                "loopMode": "loop-continuous",
                "minLength": 0.1
            }
        },
        "LeapingSpiritPiano": {
            "sustain": {
                "release": 0.3,
                "loopMode": "loop-continuous",
                "minLength": 0.1
            }
        },
        "NightwindHorn": {
            "sustain": {
                "release": 0.3,
                "loopMode": "loop-continuous",
                "minLength": 0.2
            },
            "files": [
                "m60.mp3",
                "m62.mp3",
                "m64.mp3",
                "m65.mp3",
                "m67.mp3",
                "m69.mp3",
                "m71.mp3",
                "m48.mp3",
                "m50.mp3",
                "m52.mp3",
                "m53.mp3",
                "m55.mp3",
                "m57.mp3",
                "m59.mp3"
            ]
        },
        "Vodyanitsa": {
            "sustain": {
                "release": 0.8,
                "loopMode": "loop-continuous",
                "minLength": 0.1
            },
            "files": [
                "m72.mp3",
                "m74.mp3",
                "m76.mp3",
                "m77.mp3",
                "m79.mp3",
                "m81.mp3",
                "m83.mp3",
                "m60.mp3",
                "m62.mp3",
                "m64.mp3",
                "m65.mp3",
                "m67.mp3",
                "m69.mp3",
                "m71.mp3"
            ]
        }
    }
}

const GAME: "sky" | "genshin" = APP_NAME === "Genshin" ? "genshin" : "sky"

/** The sample metadata of an instrument of the current game, undefined for a plain one-shot instrument. */
export function getInstrumentSampleMeta(name: string): InstrumentSampleMeta | undefined {
    return INSTRUMENT_SAMPLE_META[GAME][name]
}

/** The sustain config of an instrument, null when it has none or ignores note-off ('one-shot'). */
export function getInstrumentSustain(name: string): (InstrumentSustain & { loopMode: Exclude<SustainLoopMode, 'one-shot'> }) | null {
    const sustain = getInstrumentSampleMeta(name)?.sustain
    if (!sustain || sustain.loopMode === 'one-shot') return null
    return sustain as InstrumentSustain & { loopMode: Exclude<SustainLoopMode, 'one-shot'> }
}

/** Whether the notes of this instrument respond to how long they are held. */
export function instrumentSupportsSustain(name: string): boolean {
    return getInstrumentSustain(name) !== null
}

/** The variants of an instrument (alternative recordings of the whole thing), undefined when it has none. */
export function getInstrumentVariant(name: string): InstrumentVariant | undefined {
    return getInstrumentSampleMeta(name)?.variant
}

/** The variant to use for a value read from a song or from settings: unknown or missing means the default. */
export function resolveInstrumentVariant(name: string, wanted?: string | null): string | undefined {
    const variant = getInstrumentVariant(name)
    if (!variant) return undefined
    return wanted && variant.options[wanted] ? wanted : variant.default
}

/** The sample file of every note, in note order, or undefined when they are the plain `<index>.mp3`. */
export function getInstrumentNoteFiles(name: string, variant?: string | null): string[] | undefined {
    const meta = getInstrumentSampleMeta(name)
    if (!meta) return undefined
    const chosen = meta.variant ? resolveInstrumentVariant(name, variant) : undefined
    return (chosen && meta.variant?.options[chosen].files) || meta.files
}

/**
 * Songs here have no note durations, so a note of a sustained instrument is held until the next note of the same
 * layer, minus this much so the release has already started when that next note begins.
 */
export const SUSTAIN_RELEASE_TRIM_MS = 35
/** How long the last note of a layer is held, it has no next note to end at. */
export const SUSTAIN_LAST_NOTE_MS = 1500
/** The shortest hold, the instrument's own minimum length still applies on top of it. */
export const SUSTAIN_MIN_HOLD_MS = 25
/** How long every note of a layer is held, by layer index: what a song has to tell its player. */
export type SustainByLayer = Record<number, number>
