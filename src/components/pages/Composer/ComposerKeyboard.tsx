import {showRealNotes, getSheetKey} from '$lib/Songs/LibrarySheet'
import type {ScrambleSongLike} from '$lib/Songs/LibrarySheet'
import {getInversePermutation} from '$lib/Songs/NoteScramble'
import {useNotesVisible} from '$lib/Hooks/useNotesVisible'
import {devicePermissionStore} from '$stores/DevicePermissionStore'
import {COMPOSER_NOTE_POSITIONS} from '$config'
import ComposerNote from "$cmp/pages/Composer/ComposerNote"
import {InstrumentData, NoteColumn} from "$lib/Songs/SongClasses"
import {NoteNameType, Pitch, TEMPO_CHANGERS} from "$config"
import {Instrument, ObservableNote} from "$lib/audio/Instrument"
import {ComposerSettingsDataType} from "$lib/BaseSettings"
import {FaChevronLeft, FaChevronRight} from "react-icons/fa"
import {useTheme} from "$lib/Hooks/useTheme"
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {Header} from "$cmp/shared/header/Header";
import {useTranslation} from "react-i18next";

interface ComposerKeyboardProps {
    scrambleSong?: ScrambleSongLike | null
    data: {
        keyboard: Instrument
        instruments: InstrumentData[]
        isRecordingAudio: boolean
        currentLayer: number,
        currentColumn: NoteColumn,
        pitch: Pitch,
        settings: ComposerSettingsDataType
        isPlaying: boolean,
        noteNameType: NoteNameType
    },
    functions: {
        handleClick: (note: ObservableNote) => void
        startRecordingAudio: (override?: boolean) => void
        selectColumnFromDirection: (direction: number) => void
        handleTempoChanger: (tempoChanger: typeof TEMPO_CHANGERS[number]) => void
    }
}

export default function ComposerKeyboard({data, functions, scrambleSong}: ComposerKeyboardProps) {
    const notesVisible = useNotesVisible()
    const {t} = useTranslation('composer')
    const {keyboard, isPlaying, noteNameType, currentColumn, pitch, currentLayer, isRecordingAudio} = data
    const {handleClick, handleTempoChanger} = functions
    const [theme] = useTheme()
    if (keyboard === undefined) {
        return <div className="composer-keyboard-wrapper" style={{marginBottom: '4rem'}}>
            <h1>{t('error_with_this_layer')}</h1>
        </div>
    }
    if (isRecordingAudio) {
        return <div
            className="composer-keyboard-wrapper"
            style={{marginBottom: '4rem', flexDirection: 'column', alignItems: 'center'}}
        >
            <Header>
                {t('recording_audio')}...
            </Header>
            <AppButton onClick={() => functions.startRecordingAudio(false)} toggled>
                {t('stop_recording_audio')}
            </AppButton>
        </div>
    }
    const inverse = (scrambleSong && !showRealNotes(scrambleSong, notesVisible))
        ? getInversePermutation(devicePermissionStore.state.deviceId, getSheetKey(scrambleSong), COMPOSER_NOTE_POSITIONS.length)
        : null
    let keyboardClass = "keyboard"
    if (keyboard.notes.length === 15) keyboardClass += " keyboard-5"
    if (keyboard.notes.length === 14) keyboardClass += " keyboard-7-2"
    if (keyboard.notes.length === 4) keyboardClass += " keyboard-2"
    if (keyboard.notes.length === 8) keyboardClass += " keyboard-4"
    if (keyboard.notes.length === 6) keyboardClass += " keyboard-3"

    return <>
        <div className="composer-keyboard-wrapper">
            {data.settings.useKeyboardSideButtons.value &&
                <button
                    onPointerDown={() => functions.selectColumnFromDirection(-1)}
                    className={`keyboard-column-selection-buttons ${!data.isPlaying ? 'keyboard-column-selection-buttons-visible' : ''}`}
                    style={{
                        paddingRight: '0.5rem',
                        justifyContent: "flex-end",
                        visibility: data.isPlaying ? 'hidden' : 'visible'
                    }}
                >
                    <FaChevronLeft/>
                </button>
            }
            <div
                className={keyboardClass}
            >
                {keyboard.notes.length === 0 ? <div className="loading">Loading...</div> : null}
                {keyboard.notes.map((note, i) => {
                    try {
                        const realIndex = inverse ? inverse[i] : i
                        const index = currentColumn.notes.findIndex((e) => e.index === realIndex)

                        return <ComposerNote
                            key={note.index}
                            activeLayers={index >= 0 ? currentColumn.notes[index].layer.getActiveLayersMask() : 0}
                            currentLayer={currentLayer}
                            data={note}
                            theme={theme}
                            noteText={keyboard.getNoteText(i, noteNameType, pitch)}
                            instrument={keyboard.name}
                            noteImage={note.noteImage}
                            clickAction={handleClick}
                        />
                    } catch (e) {
                        return 'Err'
                    }
                })}
            </div>
            {data.settings.useKeyboardSideButtons.value &&
                <button
                    onPointerDown={() => functions.selectColumnFromDirection(1)}
                    className={`keyboard-column-selection-buttons ${!data.isPlaying ? 'keyboard-column-selection-buttons-visible' : ''}`}
                    style={{
                        paddingLeft: '0.5rem',
                        justifyContent: "flex-start",
                        visibility: data.isPlaying ? 'hidden' : 'visible'
                    }}
                >
                    <FaChevronRight/>
                </button>
            }
        </div>
        <div className={`tempo-changers-wrapper ${isPlaying ? "tempo-changers-wrapper-hidden" : ""}`}>
            <div className="bottom-right-text">
                {t('tempo')}
            </div>
            {TEMPO_CHANGERS.map((tempoChanger) => {
                return <button
                    key={tempoChanger.id}
                    onClick={() => handleTempoChanger(tempoChanger)}
                    style={{
                        ...(tempoChanger.changer === 1
                            ? {
                                backgroundColor: theme.get('primary').toString(),
                                color: theme.getText('primary').toString()
                            }
                            : {backgroundColor: "#" + tempoChanger.color.toString(16)})
                        ,
                        outline: data.currentColumn.tempoChanger === tempoChanger.id
                            ? `3px ${theme.get('composer_accent').toString()} solid`
                            : 'unset',
                        outlineOffset: '-3px'
                    }}
                >
                    {tempoChanger.text}
                </button>
            })}
        </div>
    </>
}