import {COMPOSER_NOTE_POSITIONS, NOTES_PER_COLUMN} from "$config"
import type {ColumnNote, InstrumentData} from '$lib/Songs/SongClasses';
import type {Texture} from 'pixi.js';
import {Container, Sprite} from '@pixi/react';
import {ComposerCacheData} from "./ComposerCache";
import {getScramblePermutation} from "$lib/Songs/NoteScramble";

interface RenderColumnProps {
    notes: ColumnNote[]
    currentLayer: number
    instruments: InstrumentData[]
    index: number
    sizes: {
        width: number
        height: number
    }
    cache: ComposerCacheData
    backgroundCache: Texture
    isBreakpoint: boolean
    isSelected: boolean
    isToolsSelected: boolean
    // scramble (display only)
    sheetId: string
    deviceId: string
    notesVisible: boolean
}

export function RenderColumn({
                                 notes,
                                 index,
                                 sizes,
                                 cache,
                                 instruments,
                                 backgroundCache,
                                 isBreakpoint,
                                 isSelected,
                                 isToolsSelected,
                                 currentLayer,
                                 sheetId,
                                 deviceId,
                                 notesVisible
                             }: RenderColumnProps) {
    // DISPLAY ONLY. note.index (the real pitch) is never modified or written back.
    const permutation = notesVisible
        ? null
        : getScramblePermutation(deviceId, sheetId, COMPOSER_NOTE_POSITIONS.length)

    return <Container
        eventMode="static"
        x={sizes.width * index}
    >
        <Sprite
            texture={backgroundCache}
        >
            {(isSelected || isToolsSelected) &&
                <Sprite
                    texture={isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2]}
                    alpha={isToolsSelected && !isSelected ? 0.4 : 0.8}
                    zIndex={1}
                />
            }
            {isBreakpoint &&
                <Sprite
                    texture={cache.breakpoints[1]}
                />
            }
        </Sprite>

        {notes.map((note) => {
            if (note.layer.isEmpty()) return null
            const key = Number(note.layer.asNumber())
            const displayIndex = permutation && note.index >= 0 && note.index < permutation.length
                ? permutation[note.index]
                : note.index
            return <Sprite
                key={note.index}
                texture={
                    cache.notes[key]
                }
                y={COMPOSER_NOTE_POSITIONS[displayIndex] * sizes.height / NOTES_PER_COLUMN}
            >
            </Sprite>
        })}
    </Container>
}

export function isColumnVisible(pos: number, currentPos: number, numberOfColumnsPerCanvas: number) {
    const threshold = numberOfColumnsPerCanvas / 2 + 2
    return (currentPos - threshold) < pos && pos < (currentPos + threshold)
}
