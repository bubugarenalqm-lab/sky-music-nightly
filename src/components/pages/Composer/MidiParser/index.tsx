import {Component} from 'react'
import {FileElement, FilePicker} from '$cmp/shared/Inputs/FilePicker'
import {Midi, Track} from '@tonejs/midi'
import {delay, groupNotesByIndex, isAudioFormat, isVideoFormat, mergeLayers} from '$lib/utils/Utilities'
import {ColumnNote, InstrumentData, MidiNote, NoteColumn} from '$lib/Songs/SongClasses'
import {ComposedSong} from '$lib/Songs/ComposedSong'
import {BASE_PATH, MIDI_BOUNDS, Pitch, PITCHES} from '$config'
import {logger} from '$stores/LoggerStore'
import {Theme, ThemeProvider} from '$stores/ThemeStore/ThemeProvider'
import {observe} from 'mobx'
import Switch from '$cmp/shared/Inputs/Switch'
import {NoteLayer} from '$lib/Songs/Layer'
import {HelpTooltip} from '$cmp/shared/Utility/HelpTooltip'
import {PitchSelect} from '$cmp/shared/Inputs/PitchSelect'
import {DecoratedCard} from '$cmp/shared/layout/DecoratedCard'
import {TrackInfo} from './TrackInfo'
import {NumericalInput} from './Numericalinput'
import {basicPitchLoader} from '$lib/audio/BasicPitchLoader'
import {Row} from "$cmp/shared/layout/Row";
import {Column} from "$cmp/shared/layout/Column";
import {WithTranslation} from "react-i18next/index";

interface MidiImportProps {
    t: WithTranslation<['composer', 'home', 'logs', 'question', 'common']>['t']
    data: {
        instruments: InstrumentData[]
        selectedColumn: number
    }
    functions: {
        changeMidiVisibility: (override: boolean) => void
        changePitch: (pitch: Pitch) => void
        loadSong: (song: ComposedSong) => void
    }
}

export type CustomTrack = {
    track: Track
    selected: boolean
    layer: number
    name: string
    numberOfAccidentals: number
    localOffset: number | null
    maxScaling: number
    autoFit: boolean
    outOfRangeBounds: {
        lower: number
        upper: number
    }
}

interface MidiImportState {
    fileName: string
    tracks: CustomTrack[]
    bpm: number
    offset: number
    pitch: Pitch
    accidentals: number
    outOfRange: number
    totalNotes: number
    includeAccidentals: boolean
    ignoreEmptytracks: boolean
    theme: Theme
}

class MidiImport extends Component<MidiImportProps, MidiImportState> {
    dispose: () => void
    warnedOfExperimental = false

    constructor(props: MidiImportProps) {
        super(props)
        this.state = {
            fileName: '',
            bpm: 220,
            tracks: [],
            offset: 0,
            pitch: 'C',
            ignoreEmptytracks: false,
            accidentals: 0,
            outOfRange: 0,
            totalNotes: 0,
            includeAccidentals: true,
            theme: ThemeProvider
        }
        this.dispose = () => {
        }
    }

    componentDidMount() {
        this.dispose = observe(ThemeProvider.state.data, () => {
            this.setState({theme: {...ThemeProvider}})
        })
    }

    componentWillUnmount() {
        this.dispose()
    }

    handleFile = async (files: FileElement<ArrayBuffer>[]) => {
        try {
            if (files.length === 0) return
            const file = files[0]
            const name = file.file.name
            if (isVideoFormat(name)) {
                const audio = await this.extractAudio(file)
                this.parseAudioToMidi(audio, name)
            } else if (isAudioFormat(name)) {
                const audio = await this.extractAudio(file)
                this.parseAudioToMidi(audio, name)
            } else {
                const midi = new Midi(file.data as ArrayBuffer)
                return this.mandleMidiFile(midi, name)
            }
        } catch (e) {
            console.error(e)
            logger.hidePill()
            logger.error(this.props.t('logs:error_opening_file'))
        }
    }

    extractAudio = async (audio: FileElement<ArrayBuffer>): Promise<AudioBuffer> => {
        const ctx = new AudioContext({
            sampleRate: 22050,
        })
        const buffer = await new Promise((res, rej) => {
            ctx!.decodeAudioData(audio.data as ArrayBuffer, res, rej)
        }) as AudioBuffer
        ctx.close()
        return buffer
    }

    parseAudioToMidi = async (audio: AudioBuffer, name: string) => {
        if (!this.warnedOfExperimental) logger.warn(this.props.t('midi_parser.audio_conversion_warning'))
        this.warnedOfExperimental = true
        const frames: number[][] = []
        const onsets: number[][] = []
        const model = `${BASE_PATH}/assets/audio-midi-model.json`
        logger.showPill(`${this.props.t('midi_parser.detecting_notes')}...`)
        const {BasicPitch, noteFramesToTime, outputToNotesPoly} = await basicPitchLoader()
        const basicPitch = new BasicPitch(model)
        const mono = audio.getChannelData(0)
        await basicPitch.evaluateModel(
            mono,
            (f, o) => {
                frames.push(...f);
                onsets.push(...o);
            },
            (progress) => {
                logger.showPill(`${this.props.t('midi_parser.detecting_notes')}: ${Math.floor(progress * 100)}%...`)
            }
        )
        logger.showPill(this.props.t('midi_parser.converting_audio_to_midi'))
        await delay(300)
        const notes = noteFramesToTime(
            outputToNotesPoly(
                frames,
                onsets,
                0.5,
                0.3,
                11,
                true,
                3000,
                0,
                true,
            )
        );
        const midi = new Midi();
        const track = midi.addTrack();
        notes.forEach(note => {
            track.addNote({
                midi: note.pitchMidi,
                time: note.startTimeSeconds,
                duration: note.durationSeconds,
                velocity: note.amplitude,
            })
        })
        logger.hidePill()
        this.mandleMidiFile(midi, name)
    }

    mandleMidiFile = (midi: Midi, name: string) => {
        try {
            const bpm = midi.header.tempos[0]?.bpm
            const key = midi.header.keySignatures[0]?.key
            const tracks = midi.tracks.map((track, i) => {
                const customtrack: CustomTrack = {
                    track,
                    selected: true,
                    layer: 0,
                    name: track.name || `Track n.${i + 1}`,
                    numberOfAccidentals: 0,
                    maxScaling: 0,
                    autoFit: false,
                    outOfRangeBounds: {
                        lower: 0,
                        upper: 0
                    },
                    localOffset: null
                }
                return customtrack
            })
            this.setState({
                tracks,
                fileName: name,
                bpm: Math.floor(bpm * 4) || 220,
                offset: 0,
                pitch: (PITCHES.includes(key as never) ? key : 'C') as Pitch,
            }, () => {
                if (this.state.tracks.length) this.convertMidi()
            })
        } catch (e) {
            console.error(e)
            logger.error(this.props.t('midi_parser.error_is_file_midi'))
        }
    }

    convertMidi = () => {
        const {tracks, bpm, offset, includeAccidentals, pitch} = this.state
        const selectedTracks = tracks.filter(track => track.selected)
        const notes: MidiNote[] = []
        let accidentals = 0
        let outOfRange = 0
        let totalNotes = 0
        selectedTracks.forEach(track => {
            track.numberOfAccidentals = 0
            track.outOfRangeBounds.upper = 0
            track.outOfRangeBounds.lower = 0
            track.track.notes.forEach(midiNote => {
                totalNotes++
                const note = MidiNote.fromMidi(
                    track.layer,
                    Math.floor(midiNote.time * 1000),
                    midiNote.midi - (track.localOffset ?? offset),
                    track.maxScaling
                )
                if (note.data.isAccidental) {
                    accidentals++
                    track.numberOfAccidentals++
                }
                if (note.data.note !== -1) {
                    if (includeAccidentals || !note.data.isAccidental) {
                        notes.push(note)
                    }
                } else {
                    outOfRange++
                    if (note.data.outOfRangeBound === -1) track.outOfRangeBounds.lower++
                    if (note.data.outOfRangeBound === 1) track.outOfRangeBounds.upper++
                }
            })
        })
        const sorted = notes.sort((a, b) => a.time - b.time)
        const bpmToMs = 60000 / bpm
        const groupedNotes: MidiNote[][] = []
        while (sorted.length > 0) {
            const row = [sorted.shift() as MidiNote]
            let amount = 0
            for (let i = 0; i < sorted.length; i++) {
                if (row[0].time > sorted[i].time - bpmToMs / 9) amount++
            }
            groupedNotes.push([...row, ...sorted.splice(0, amount)])
        }
        const columns: NoteColumn[] = []
        let previousTime = 0
        groupedNotes.forEach(notes => {
            const note = notes[0]
            if (!note) return
            const elapsedTime = note.time - previousTime
            const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
            const noteColumn = new NoteColumn()
            previousTime = note.time
            if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new NoteColumn()))
            noteColumn.notes = notes.map(note => {
                const layer = new NoteLayer()
                layer.set(note.layer, true)
                return new ColumnNote(note.data.note, layer)
            })
            columns.push(noteColumn)
        })
        columns.forEach(column => {
            const groupedNotes = groupNotesByIndex(column)
            column.notes = groupedNotes.map(group => {
                group[0].layer = mergeLayers(group)
                return group[0]
            })
        })
        const song = new ComposedSong("Untitled")
        song.columns = columns
        song.bpm = bpm
        song.instruments = []
        song.instruments = this.props.data.instruments.map(ins => ins.clone())
        song.pitch = pitch
        const lastColumn = this.props.data.selectedColumn
        song.selected = lastColumn < song.columns.length ? lastColumn : 0
        if (song.columns.length === 0) {
            return logger.warn(this.props.t('midi_parser.there_are_no_notes'))
        }
        this.props.functions.loadSong(song)
        this.setState({accidentals, totalNotes, outOfRange})
    }

    editTrack = (index: number, data: Partial<CustomTrack>) => {
        let tracks = [...this.state.tracks]
        tracks[index] = {...tracks[index], ...data}
        // Nếu local offset của track vừa đổi và track đang bật auto-fit,
        // tính lại maxScaling ngay theo offset mới (tránh lệch nhịp debounce)
        if ('localOffset' in data && tracks[index].autoFit) {
            tracks[index] = {
                ...tracks[index],
                maxScaling: this.computeAutoFitScaling(tracks[index], this.state.offset)
            }
        }
        this.setState({tracks}, () => {
            if (this.state.tracks.length > 0) this.convertMidi()
        })
    }

    // Tính maxScaling tối thiểu để đưa các nốt NGOÀI khoảng vào trong, dựa trên
    // offset đang áp dụng thực tế cho track (local nếu có, không thì global).
    // Đây là cơ chế per-note có sẵn trong MidiNote.fromMidi: nốt nào đã nằm
    // trong [MIDI_BOUNDS.lower, MIDI_BOUNDS.upper] sẽ không bị đụng tới, chỉ
    // những nốt vượt khung mới được dịch dần (mỗi vòng lặp dịch 8 nửa cung,
    // đúng bước mà fromMidi dùng) cho tới khi vào trong khung.
    computeAutoFitScaling = (track: CustomTrack, globalOffset: number): number => {
        const STEP = 12 // trùng với bước dịch (1 quãng tám thật) trong MidiNote.fromMidi
        const currentOffset = track.localOffset ?? globalOffset
        let neededScaling = 0
        track.track.notes.forEach(midiNote => {
            const pitch = midiNote.midi - currentOffset
            let steps = 0
            if (pitch < MIDI_BOUNDS.lower) {
                steps = Math.ceil((MIDI_BOUNDS.lower - pitch) / STEP)
            } else if (pitch > MIDI_BOUNDS.upper) {
                steps = Math.ceil((pitch - MIDI_BOUNDS.upper) / STEP)
            }
            if (steps > neededScaling) neededScaling = steps
        })
        return neededScaling
    }

    // Bật auto-fit cho track: đánh dấu autoFit=true và tính maxScaling ngay lập tức
    autoFitTrack = (index: number) => {
        const tracks = [...this.state.tracks]
        const track = tracks[index]
        if (!track) return
        tracks[index] = {
            ...track,
            autoFit: true,
            maxScaling: this.computeAutoFitScaling(track, this.state.offset)
        }
        this.setState({tracks}, () => {
            if (this.state.tracks.length > 0) this.convertMidi()
        })
    }

    // Tắt auto-fit -> trả maxScaling về 0 (mặc định, không dịch nốt nào)
    autoFitReset = (index: number) => {
        const tracks = [...this.state.tracks]
        const track = tracks[index]
        if (!track) return
        tracks[index] = {...track, autoFit: false, maxScaling: 0}
        this.setState({tracks}, () => {
            if (this.state.tracks.length > 0) this.convertMidi()
        })
    }

    // Với mọi track đang bật auto-fit, tính lại maxScaling theo offset mới nhất.
    // Được gọi lại mỗi khi global offset hoặc local offset của 1 track thay đổi,
    // để tránh tình trạng maxScaling bị "lệch nhịp" so với debounce của ô offset.
    resyncAutoFitTracks = (tracks: CustomTrack[], globalOffset: number): CustomTrack[] => {
        return tracks.map(track =>
            track.autoFit
                ? {...track, maxScaling: this.computeAutoFitScaling(track, globalOffset)}
                : track
        )
    }

    changeOffset = (value: number) => {
        if (!Number.isInteger(value)) value = 0
        if (this.state.offset === value) return
        // Global offset đổi -> tính lại maxScaling cho mọi track đang bật auto-fit,
        // để không bị lệch nhịp so với debounce của ô nhập offset
        const tracks = this.resyncAutoFitTracks(this.state.tracks, value)
        this.setState({offset: value, tracks}, () => {
            if (this.state.tracks.length > 0) this.convertMidi()
        })
    }

    changePitch = (value: Pitch) => {
        this.props.functions.changePitch(value)
        this.setState({pitch: value})
    }

    toggleAccidentals = () => {
        this.setState({includeAccidentals: !this.state.includeAccidentals}, () => {
            if (this.state.tracks.length > 0) this.convertMidi()
        })
    }

    changeBpm = (value: number) => {
        if (!Number.isInteger(value)) value = 0
        if (this.state.bpm === value) return
        this.setState({bpm: value}, () => {
            if (this.state.tracks.length > 0) this.convertMidi()
        })
    }

    render() {
        const {handleFile, editTrack, state, changeBpm, changeOffset, changePitch} = this
        const {
            tracks, fileName, bpm, offset, pitch,
            accidentals, outOfRange, totalNotes,
            includeAccidentals, theme, ignoreEmptytracks
        } = state
        const {functions, data, t} = this.props
        const {changeMidiVisibility} = functions
        const midiInputsStyle = {
            backgroundColor: theme.layer('primary', 0.2).toString(),
            color: theme.getText('primary').toString()
        }
        return <DecoratedCard
            className='floating-midi'
            size='1.2rem'
            isRelative={false}
            offset="0.1rem"
        >
            <Column className='floating-midi-content' gap={'0.3rem'}>
                <Row className='separator-border' align={'center'} style={{width: '100%'}}>
                    <FilePicker onPick={handleFile} as='buffer'>
                        <button className="midi-btn" style={{...midiInputsStyle, whiteSpace: 'nowrap'}}>
                            {t('midi_parser.open_midi_audio_file')}
                        </button>
                    </FilePicker>
                    <div style={{margin: '0 0.5rem'}} className='text-ellipsis'>
                        {fileName}
                    </div>
                    <button
                        className='midi-btn'
                        style={{marginLeft: 'auto', ...midiInputsStyle}}
                        onClick={() => changeMidiVisibility(false)}
                    >
                        {t('common:close')}
                    </button>
                </Row>
                <Row justify={'between'} align={'center'}>
                    <div style={{marginRight: '0.5rem'}}>{t('common:bpm')}:</div>
                    <NumericalInput value={bpm} onChange={changeBpm} delay={600} style={midiInputsStyle} step={5}/>
                </Row>
                <Row justify={'between'} align={'center'}>
                    <div className='row flex-centered'>
                        <span style={{marginRight: '0.5rem'}}>{t('midi_parser.global_note_offset')}: </span>
                        <HelpTooltip buttonStyle={{width: '1.2rem', height: '1.2rem'}}>
                            {t('midi_parser.global_note_offset_description')}
                        </HelpTooltip>
                    </div>
                    <NumericalInput value={offset} onChange={changeOffset} delay={600} style={midiInputsStyle} step={1}/>
                </Row>
                <Row justify={'between'} align={'center'}>
                    <div style={{marginRight: '0.5rem'}}>{t('common:pitch')}:</div>
                    <PitchSelect
                        style={{width: '5rem', ...midiInputsStyle}}
                        selected={pitch}
                        onChange={changePitch}
                    />
                </Row>
                <Row justify={'between'} align={'center'}>
                    <Row align={'center'}>
                        <div style={{marginRight: '0.5rem'}}>{t("midi_parser.include_accidentals")}:</div>
                        <Switch checked={includeAccidentals} onChange={this.toggleAccidentals} styleOuter={midiInputsStyle}/>
                    </Row>
                    <Row align={'center'}>
                        <div style={{marginRight: '0.5rem'}}>{t("midi_parser.ignore_empty_tracks")}:</div>
                        <Switch
                            checked={ignoreEmptytracks}
                            onChange={(b) => this.setState({ignoreEmptytracks: b})}
                            styleOuter={midiInputsStyle}
                        />
                    </Row>
                </Row>
                {tracks.length > 0 &&
                    <Column className='separator-border' style={{width: '100%'}}>
                        <Column style={{width: '100%'}}>
                            <div style={{textAlign: 'center'}}>{t("midi_parser.select_midi_tracks")}</div>
                            {tracks.map((track, i) =>
                                !(ignoreEmptytracks && track.track.notes.length === 0) &&
                                <TrackInfo
                                    data={track}
                                    instruments={data.instruments}
                                    key={i}
                                    index={i}
                                    onChange={editTrack}
                                    onAutoFit={this.autoFitTrack}
                                    onAutoFitReset={this.autoFitReset}
                                    theme={theme}
                                />
                            )}
                        </Column>
                    </Column>
                }
                {tracks.length > 0 &&
                    <table>
                        <tbody>
                        <tr>
                            <td>{t("midi_parser.total_notes")}:</td>
                            <td/>
                            <td>{totalNotes}</td>
                        </tr>
                        <tr>
                            <td>{t("midi_parser.accidentals")}:</td>
                            <td/>
                            <td>{accidentals}</td>
                        </tr>
                        <tr>
                            <td>{t("midi_parser.out_of_range")}:</td>
                            <td/>
                            <td>{outOfRange}</td>
                        </tr>
                        </tbody>
                    </table>
                }
            </Column>
        </DecoratedCard>
    }
}

export default MidiImport
