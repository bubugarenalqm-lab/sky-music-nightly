import { showRealNotes } from '$lib/Songs/LibrarySheet'
//TODO i hate this component with all my heart, the code needs to be improved, but this is the only way to make
//it half performant, maybe i should get rid of react pixi and do it manually, that might improve garbage collection
//since sprites are always removed and added to the stage everytime it scrolls
import {Component, createRef} from 'react'
import {Container, Graphics, Stage} from '@pixi/react';
import {
    FaChevronLeft,
    FaChevronRight,
    FaMinusCircle,
    FaPlusCircle,
    FaStepBackward,
    FaStepForward
} from 'react-icons/fa';
import isMobile from "is-mobile"
import {ComposerCache} from "$cmp/pages/Composer/ComposerCache"
import {APP_NAME} from "$config"
import {MemoizedIcon} from '$cmp/shared/Utility/Memoized';
import {ThemeProvider} from '$stores/ThemeStore/ThemeProvider';
import {clamp, colorToRGB, nearestEven} from '$lib/utils/Utilities';
import type {NoteColumn} from '$lib/Songs/SongClasses';
import type {ComposerSettingsDataType} from '$lib/BaseSettings';
import {isColumnVisible, RenderColumn} from '$cmp/pages/Composer/RenderColumn';
import {TimelineButton} from './TimelineButton';
import {Timer} from '$types/GeneralTypes';
import {ComposedSong} from '$lib/Songs/ComposedSong';
import {subscribeTheme} from '$lib/Hooks/useTheme';
import {createShortcutListener} from '$stores/KeybindsStore';
import {FederatedPointerEvent} from 'pixi.js';
import {ComposerBreakpointsRenderer} from "$cmp/pages/Composer/ComposerBreakpointsRenderer";
import {WithTranslation} from "react-i18next/index";
import {reaction} from 'mobx'
import {devicePermissionStore} from '$stores/DevicePermissionStore'

type ClickEventType = 'up' | 'down-slider' | 'down-stage'

//Smooth "glide" scrolling while the composer is playing: instead of snapping column by column, the timeline
//slides continuously from the current column to the next one over that column's duration.
//Set to false to go back to the old snapping behaviour.
const GLIDE_ENABLED = true

//Smooth scrolling for everything the user does by hand: the timeline follows the pointer pixel by pixel while
//dragging (stage and bottom timeline), settles on a whole column with a short ease when let go, keeps going
//like a flick when thrown, and eases when stepping or using the wheel.
//Set to false to go back to moving one whole column at a time.
const SMOOTH_SCROLL_ENABLED = true

//how long the timeline takes to settle on a column after a drag, a wheel or a step
const SCROLL_EASE_MS = 140
//how long the wheel has to be quiet before the timeline settles on the nearest column
const WHEEL_SETTLE_IDLE_MS = 100
//a wheel "line" has no pixel size, this is the usual approximation
const WHEEL_LINE_PX = 16
//a pixel delta this big is a notch of a classic mouse wheel (one column per notch), smaller ones come from
//touchpads and move the timeline directly
const WHEEL_NOTCH_PX = 50
//how far the pointer has to travel before a press stops being a click and becomes a drag
const DRAG_SLOP_PX = 3
//the release speed is measured over this trailing window only, so drag-pause-release does not throw
const FLICK_WINDOW_MS = 100
//release speed (screen px per ms) from which a release is a flick that keeps going, and the cap on it
const FLICK_MIN_SPEED_PX_PER_MS = 0.4
const FLICK_MAX_SPEED_PX_PER_MS = 3
//exponential decay of a flick, per ms. A flick travels speed / decay and lands on a whole column
const COAST_DECAY_PER_MS = 0.005
//a flick counts as arrived when what is left is this many px
const COAST_ARRIVAL_PX = 0.5

type PointerSample = { x: number, t: number }

//What is moving the timeline right now. `position` / `from` / `to` are in columns and can be fractional.
type ScrollMotion =
    | { kind: 'rest' }
    | { kind: 'dragging', position: number }
    | { kind: 'wheeling', position: number }
    | { kind: 'easing', from: number, to: number, startMs: number, durationMs: number }
    | { kind: 'coasting', from: number, to: number, startMs: number, durationMs: number, publishedColumn: number }

interface ComposerCanvasProps {
    t: WithTranslation<['composer', 'home', 'logs', 'question', 'common']>['t']
    data: {
        columns: NoteColumn[],
        isPlaying: boolean,
        isRecordingAudio: boolean,
        song: ComposedSong
        selected: number,
        currentLayer: number,
        inPreview?: boolean,
        settings: ComposerSettingsDataType,
        breakpoints: number[],
        selectedColumns: number[],
    }
    functions: {
        selectColumn: (index: number, ignoreAudio?: boolean) => void,
        toggleBreakpoint: () => void
    }

}

interface ComposerCanvasState {
    width: number
    height: number
    numberOfColumnsPerCanvas: number
    column: {
        width: number
        height: number
    }
    stageOptions: {
        backgroundColor: number,
        autoDensity: boolean,
        resolution: number,
    },
    timelineOptions: {}
    timelineHeight: number
    currentBreakpoint: number
    theme: {
        timeline: {
            hex: string
            hexNumber: number
            selected: number
            border: number
        }
        sideButtons: {
            hex: string
            rgb: string
        }
        main: {
            background: number
            backgroundHex: string
            backgroundOpacity: number
        }
    }
    cache: ComposerCache | null
}

export default class ComposerCanvas extends Component<ComposerCanvasProps, ComposerCanvasState> {
    state: ComposerCanvasState
    notesStageRef: any
    breakpointsStageRef: any
    stageSelected: boolean
    sliderSelected: boolean
    hasSlided: boolean
    sliderOffset: number
    onSlider: boolean
    cacheRecalculateDebounce: Timer
    cleanup: (() => void)[] = []
    notesContainerRef: any
    timelineCursorRef: any
    glideAnchorAt: number = 0 //performance.now() of the moment the current column started being "played"
    motion: ScrollMotion = {kind: 'rest'}
    motionFrame: number = 0 //requestAnimationFrame id of the motion loop, 0 when not running
    publishedColumn: number = -1 //the last column a motion asked the composer to select
    lastShownPosition: number = 0 //where the timeline was last drawn, in columns
    lastAppliedPosition: number = NaN //where the last frame put it, used to skip frames that would not move anything
    renderedPlaying: boolean = false //isPlaying / selected as of the previous render
    renderedSelected: number = -1
    dragStartX: number = 0
    dragAnchorPosition: number = 0
    dragSamples: PointerSample[] = []
    wheelSettleTimeout: any = 0

    constructor(props: ComposerCanvasProps) {
        super(props)
        const numberOfColumnsPerCanvas = Number(this.props.data.settings.columnsPerCanvas.value)
        const width = 300
        const height = 150
        this.state = {
            width: Math.floor(width),
            height: Math.floor(height),
            numberOfColumnsPerCanvas,
            stageOptions: {
                backgroundColor: ThemeProvider.get('primary').rgbNumber(),
                autoDensity: true,
                resolution: 1.4
            },
            timelineOptions: {
                backgroundAlpha: 0,
                autoDensity: true,
                resolution: 1.4
            },
            column: {
                width: nearestEven(width / numberOfColumnsPerCanvas),
                height: height
            },
            timelineHeight: 30,
            currentBreakpoint: -1,
            theme: {
                timeline: {
                    hex: ThemeProvider.layer('primary', 0.1).toString(),
                    hexNumber: ThemeProvider.layer('primary', 0.1).rgbNumber(),
                    selected: ThemeProvider.get('composer_accent').negate().rgbNumber(),
                    border: ThemeProvider.get('composer_accent').rgbNumber()
                },
                sideButtons: {
                    hex: ThemeProvider.get('primary').darken(0.08).toString(),
                    rgb: colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(',')
                },
                main: {
                    background: ThemeProvider.get('primary').rgbNumber(),
                    backgroundHex: ThemeProvider.get('primary').toString(),
                    backgroundOpacity: ThemeProvider.get('primary').alpha()
                },
            },
            cache: null,
        }
        this.notesStageRef = createRef()
        this.breakpointsStageRef = createRef()
        this.notesContainerRef = createRef()
        this.timelineCursorRef = createRef()
        this.stageSelected = false
        this.sliderSelected = false
        this.hasSlided = false
        this.sliderOffset = 0
        this.onSlider = false
        //TODO memory leak somewhere in this page
        this.cacheRecalculateDebounce = 0
    }

    componentDidMount() {
        const {numberOfColumnsPerCanvas} = this.state
        const bodySizes = document.body.getBoundingClientRect()
        // Dung window.innerWidth thay vi body.getBoundingClientRect().width:
        // neu body dang bi tran ngang (vd do 1 hang phim rong hon man hinh),
        // width cua body se lon hon man hinh that, gay vong lap khien canvas/
        // thanh thoi gian ngay cang rong ra tren mobile.
        const sizes = {width: Math.min(window.innerWidth, bodySizes.width), height: bodySizes.height}
        let width = nearestEven(sizes.width * 0.85 - 45)
        // Chan cung: khong bao gio vuot qua man hinh that, du body co bi tran hay khong
        width = Math.min(width, window.innerWidth - 16)
        let height = nearestEven(sizes.height * 0.45)
        if (APP_NAME === "Sky") height = nearestEven(height * 0.95)
        this.setState({
            width: Math.floor(width),
            height: Math.floor(height),
            stageOptions: {
                backgroundColor: ThemeProvider.get('primary').rgbNumber(),
                autoDensity: true,
                resolution: window.devicePixelRatio ?? 1.4
            },
            timelineOptions: {
                backgroundAlpha: 0,
                autoDensity: true,
                resolution: window.devicePixelRatio ?? 1.4
            },
            numberOfColumnsPerCanvas,
            column: {
                width: nearestEven(width / numberOfColumnsPerCanvas),
                height: height
            },
            timelineHeight: isMobile() ? 25 : 30,
        }, () => {
            window.addEventListener("resize", this.recalculateCacheAndSizes)
            this.recalculateCacheAndSizes()
        })

        window.addEventListener("pointerup", this.resetPointerDown)
        window.addEventListener("pointercancel", this.resetPointerDown)
        window.addEventListener("blur", this.resetPointerDown)
        const shortcutDisposer = createShortcutListener("composer", "composer_canvas", ({shortcut}) => {
            const {name} = shortcut
            if (name === "next_breakpoint") this.handleBreakpoints(1)
            if (name === "previous_breakpoint") this.handleBreakpoints(-1)
        })
        this.notesStageRef?.current?._canvas?.addEventListener("wheel", this.handleWheel)
        const themeDispose = subscribeTheme(this.handleThemeChange)
        const permissionDispose = reaction(
            () => devicePermissionStore.state.notesVisible,
            () => this.forceUpdate()
        )
        this.cleanup.push(themeDispose, shortcutDisposer, permissionDispose)
    }

    componentWillUnmount() {
        this.stopFrames()
        this.cancelWheelSettle()
        window.removeEventListener("pointerup", this.resetPointerDown)
        window.removeEventListener("pointercancel", this.resetPointerDown)
        window.removeEventListener("blur", this.resetPointerDown)
        window.removeEventListener("resize", this.recalculateCacheAndSizes)
        if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce)
        this.notesStageRef?.current?._canvas?.removeEventListener("wheel", this.handleWheel)
        this.cleanup.forEach(fn => fn())
        this.state.cache?.destroy()
        this.notesStageRef = null
        this.breakpointsStageRef = null
    }

    //The window-level release (a pointerup anywhere, a cancel, a blur). The pixi handlers run first and have
    //already settled the drag by now, in which case settleDrag does nothing, this is only the safety net for
    //releases pixi never hears about. Only a real pointerup may throw a flick.
    resetPointerDown = (e?: Event) => {
        const samples = this.dragSamples
        this.stageSelected = false
        this.sliderSelected = false
        this.dragSamples = []
        this.settleDrag(e?.type === 'pointerup', samples)
    }
    handleThemeChange = () => {
        this.setState({
            stageOptions: {
                ...this.state.stageOptions,
                backgroundColor: ThemeProvider.get('primary').rgbNumber()
            },
            theme: {
                timeline: {
                    hex: ThemeProvider.layer('primary', 0.1).hex(),
                    hexNumber: ThemeProvider.layer('primary', 0.1).rgbNumber(),
                    selected: ThemeProvider.get('composer_accent').negate().rgbNumber(),
                    border: ThemeProvider.get('composer_accent').rgbNumber()
                },
                sideButtons: {
                    hex: ThemeProvider.get('primary').darken(0.08).hex(),
                    rgb: colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(",")
                },
                main: {
                    background: ThemeProvider.get('primary').rgbNumber(),
                    backgroundHex: ThemeProvider.get('primary').hexa(),
                    backgroundOpacity: Math.max(ThemeProvider.get('primary').alpha(), 0.8)
                }
            }
        }, () => {
            this.recalculateCacheAndSizes()
            if (this.notesStageRef?.current) {
                this.notesStageRef.current.app.renderer.background.color = this.state.theme.main.background
            }
        })
    }
    recalculateCacheAndSizes = () => {
        if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce)
        this.cacheRecalculateDebounce = setTimeout(() => {
            if (!this.notesStageRef?.current || !this.breakpointsStageRef?.current) return
            const bodySizes = document.body.getBoundingClientRect()
            const sizes = {width: Math.min(window.innerWidth, bodySizes.width), height: bodySizes.height}
            const {numberOfColumnsPerCanvas} = this.state
            const {inPreview} = this.props.data
            let width = nearestEven(sizes.width * 0.85 - 45)
            // Chan cung: khong bao gio vuot qua man hinh that
            width = Math.min(width, window.innerWidth - 16)
            let height = nearestEven(sizes.height * 0.45)
            if (APP_NAME === "Sky") height = nearestEven(height * 0.95)
            if (inPreview) {
                width = nearestEven(width * (sizes.width < 900 ? 0.8 : 0.55))
                height = nearestEven(height * (sizes.width < 900 ? 0.8 : 0.6))
            }
            let columnWidth = nearestEven(width / numberOfColumnsPerCanvas)
            const oldCache = this.state.cache
            this.setState({
                width: Math.floor(width),
                height: Math.floor(height),
                column: {
                    width: columnWidth,
                    height
                },
                cache: this.generateCache(columnWidth, height, isMobile() ? 2 : 4, isMobile() ? 25 : 30),
            }, () => {
                //TODO not sure why pixi is reusing textures after it's destroyed
                setTimeout(() => {
                    oldCache?.destroy()
                }, 500)
            })
        }, 50)
    }

    generateCache(columnWidth: number, height: number, margin: number, timelineHeight: number) {
        const colors = {
            l: ThemeProvider.get('primary'), //light
            d: ThemeProvider.get('primary') //dark
        }
        colors.l = colors.l.luminosity() < 0.05 ? colors.l.lighten(0.4) : colors.l.lighten(0.1)
        colors.d = colors.d.luminosity() < 0.05 ? colors.d.lighten(0.15) : colors.d.darken(0.03)
        if (!this.notesStageRef?.current || !this.breakpointsStageRef?.current) return null
        return new ComposerCache({
            width: columnWidth,
            height,
            margin,
            timelineHeight,
            app: this.notesStageRef.current.app,
            breakpointsApp: this.breakpointsStageRef.current.app,
            colors: {
                accent: ThemeProvider.get('composer_accent').rotate(20).darken(0.5),
                mainLayer: ThemeProvider.get('composer_main_layer'),
                secondLayer: ThemeProvider.get('composer_secondary_layer'),
                bars: [
                    {
                        color: colors.l.rgbNumber() //lighter
                    }, {
                        color: colors.d.rgbNumber() //darker
                    }, {
                        color: ThemeProvider.get('composer_accent').rgbNumber() //current
                    }, {
                        color: ThemeProvider.get('composer_accent').negate().rgbNumber()
                    }
                ]
            }
        })
    }

    componentDidUpdate(prevProps: ComposerCanvasProps) {
        if (prevProps.data.currentLayer !== this.props.data.currentLayer) {
            this.state.cache?.setCurrentLayer(this.props.data.currentLayer)
            this.forceUpdate()
        }
        //render() can start a motion (stepping one column, playback stopping), keep the frames going while one runs
        if (this.wantsFrames()) this.ensureFrames()
    }

    // ---------------------------------------------------------------------------------------------------------
    // Smooth scrolling.
    //
    // `selected` (a whole column) is what the composer plays, highlights and edits. What is DRAWN is a fractional
    // position in columns (`getScrollPosition`), which follows the pointer while dragging, slides to the next
    // column while playing, eases when letting go and keeps going after a flick. React renders and the frame loop
    // below both place the pixi containers from that same function, so they always agree.
    // ---------------------------------------------------------------------------------------------------------

    wantsFrames = (): boolean => {
        const {kind} = this.motion
        return kind === 'easing' || kind === 'coasting' || (GLIDE_ENABLED && this.props.data.isPlaying)
    }

    /**
     * While playing: how far (in columns) the timeline has slid from the selected column towards the next one.
     * 0 = exactly on the selected column, 1 = exactly on the next one. It can be slightly negative: the audio
     * of a column plays `lookaheadTime` after the column gets selected, so we wait for the sound before sliding,
     * which keeps the picture in sync with what is heard instead of running ahead of it.
     * Returns 0 whenever the song is not playing.
     */
    getGlideFraction = (): number => {
        const {data} = this.props
        if (!GLIDE_ENABLED || !data.isPlaying) return 0
        const column = data.columns[data.selected]
        if (!column) return 0
        //same formula the composer uses to wait between two columns
        const durationMs = 60000 / Number(data.settings.bpm.value) * column.getTempoChanger().changer
        if (!isFinite(durationMs) || durationMs <= 0) return 0
        const lookaheadMs = Number(data.settings.lookaheadTime.value) || 0
        const elapsed = performance.now() - this.glideAnchorAt - lookaheadMs
        return clamp(elapsed / durationMs, -1, 1)
    }

    /**
     * Where the timeline is, in columns (fractional). Read off the wall clock, so uneven frames never drift.
     * At rest it is the selected column, plus the playback glide while the song is playing.
     */
    getScrollPosition = (now: number = performance.now()): number => {
        const motion = this.motion
        switch (motion.kind) {
            case 'dragging':
            case 'wheeling':
                return motion.position
            case 'easing': {
                const elapsed = now - motion.startMs
                if (elapsed >= motion.durationMs) return motion.to
                const t = elapsed / motion.durationMs
                //easeOutCubic: leaves fast and lands softly
                return motion.from + (motion.to - motion.from) * (1 - Math.pow(1 - t, 3))
            }
            case 'coasting': {
                const elapsed = now - motion.startMs
                if (elapsed >= motion.durationMs) return motion.to
                //exponential decay: leaves at the release's own speed and slows all the way in
                return motion.to - (motion.to - motion.from) * Math.exp(-COAST_DECAY_PER_MS * elapsed)
            }
            default:
                return this.props.data.selected + this.getGlideFraction()
        }
    }

    startEase = (from: number, to: number, now: number) => {
        this.motion = {kind: 'easing', from, to, startMs: now, durationMs: SCROLL_EASE_MS}
        this.publishedColumn = to
    }

    /**
     * Called at the start of every render (so what React draws already knows about it). It does three things:
     * remembers when the selected column changed while playing, which is what the playback glide is measured
     * from (otherwise that render would use the old anchor and jump a whole column for one frame); slides back
     * from the middle of a glide when playback stops; and slides instead of jumping when the selection is moved
     * by one column from outside (arrow keys, side buttons).
     */
    syncMotionWithProps = () => {
        const {isPlaying, selected} = this.props.data
        const now = performance.now()
        if (isPlaying && (!this.renderedPlaying || selected !== this.renderedSelected)) {
            this.glideAnchorAt = now
        }
        if (SMOOTH_SCROLL_ENABLED && !isPlaying) {
            const motion = this.motion
            if (motion.kind === 'rest') {
                if (this.renderedPlaying) {
                    if (Math.abs(this.lastShownPosition - selected) > 0.001) {
                        this.startEase(this.lastShownPosition, selected, now)
                    }
                } else if (this.renderedSelected >= 0 && Math.abs(selected - this.renderedSelected) === 1) {
                    this.startEase(this.renderedSelected, selected, now)
                }
            } else if (motion.kind === 'easing' && selected !== motion.to && Math.abs(selected - motion.to) <= 3) {
                //stepped again before the last slide ended: carry on from where it is towards the new column
                this.startEase(this.getScrollPosition(now), selected, now)
            }
        }
        this.renderedPlaying = isPlaying
        this.renderedSelected = selected
    }

    //asks the composer to select the column under the timeline, silently, once per column crossed
    publishFloor = (position: number) => {
        const column = Math.floor(position)
        if (column === this.publishedColumn) return
        this.publishedColumn = column
        this.props.functions.selectColumn(column, true)
    }

    ensureFrames = () => {
        if (this.motionFrame) return
        this.motionFrame = requestAnimationFrame(this.onFrame)
    }

    stopFrames = () => {
        if (this.motionFrame) cancelAnimationFrame(this.motionFrame)
        this.motionFrame = 0
    }

    onFrame = () => {
        this.motionFrame = 0
        if (this.advanceMotion()) this.motionFrame = requestAnimationFrame(this.onFrame)
    }

    /** One frame: finishes eases and flicks that arrived, publishes the columns a flick crosses, and draws. */
    advanceMotion = (): boolean => {
        const now = performance.now()
        const motion = this.motion
        if (motion.kind === 'easing') {
            if (now - motion.startMs >= motion.durationMs) this.motion = {kind: 'rest'}
        } else if (motion.kind === 'coasting') {
            const column = Math.floor(this.getScrollPosition(now))
            if (column !== motion.publishedColumn) {
                motion.publishedColumn = column
                this.publishedColumn = column
                this.props.functions.selectColumn(column, true)
            }
            const arrived = now - motion.startMs >= motion.durationMs
            //wait for the selection to reach the landing column so the last frame is not drawn on a stale one
            if (arrived && (this.props.data.selected === motion.to || now - motion.startMs > motion.durationMs + 300)) {
                this.motion = {kind: 'rest'}
            }
        }
        this.applyScroll()
        return this.wantsFrames()
    }

    /**
     * Moves the notes container and the little window on the bottom timeline straight on the pixi objects and
     * renders the stages, without going through a React update for every frame.
     */
    applyScroll = (force: boolean = false) => {
        const {data} = this.props
        const {numberOfColumnsPerCanvas, column, width} = this.state
        const position = this.getScrollPosition()
        if (!force && position === this.lastAppliedPosition) return
        this.lastAppliedPosition = position
        this.lastShownPosition = position
        const container = this.notesContainerRef?.current
        const notesApp = this.notesStageRef?.current?.app
        if (container && notesApp) {
            container.x = (position - numberOfColumnsPerCanvas / 2 + 1) * -column.width
            notesApp.render()
        }
        const cursor = this.timelineCursorRef?.current
        const timelineApp = this.breakpointsStageRef?.current?.app
        if (cursor && timelineApp && data.columns.length) {
            const relativeColumnWidth = width / data.columns.length
            cursor.x = relativeColumnWidth * position - relativeColumnWidth * (numberOfColumnsPerCanvas / 2)
            timelineApp.render()
        }
    }

    /** Settles the timeline from `from` on the whole column `target` (selecting it) with a short ease. */
    easeTo = (from: number, target: number) => {
        const {data, functions} = this.props
        this.publishedColumn = target
        if (!SMOOTH_SCROLL_ENABLED || data.isPlaying || from === target) {
            this.motion = {kind: 'rest'}
        } else {
            this.motion = {kind: 'easing', from, to: target, startMs: performance.now(), durationMs: SCROLL_EASE_MS}
            this.ensureFrames()
        }
        if (target !== data.selected) functions.selectColumn(target, true)
        else this.applyScroll(true)
    }

    /**
     * The flick a release earns, or null for "just settle". The speed is read from the pointer samples in the
     * trailing FLICK_WINDOW_MS (a pointer that stopped before letting go has none), converted to columns, and
     * the flick lands on the column the decay would reach, so it leaves at the release's own speed.
     */
    coastFromRelease = (releasePosition: number, samples: PointerSample[]): ScrollMotion | null => {
        const now = performance.now()
        const fresh = samples.filter(sample => sample.t >= now - FLICK_WINDOW_MS)
        if (fresh.length < 2) return null
        const first = fresh[0]
        const last = fresh[fresh.length - 1]
        const dtMs = last.t - first.t
        if (dtMs <= 0) return null
        const speedPx = (last.x - first.x) / dtMs
        if (Math.abs(speedPx) < FLICK_MIN_SPEED_PX_PER_MS) return null
        const cappedPx = Math.min(Math.abs(speedPx), FLICK_MAX_SPEED_PX_PER_MS)
        const columnWidth = this.state.column.width
        //a pointer moving left throws the song forward
        const speedColumns = Math.sign(-speedPx) * cappedPx / columnWidth
        const lastColumn = this.props.data.columns.length - 1
        const to = clamp(Math.round(releasePosition + speedColumns / COAST_DECAY_PER_MS), 0, lastColumn)
        if (to === clamp(Math.round(releasePosition), 0, lastColumn)) return null
        const distancePx = Math.abs(to - releasePosition) * columnWidth
        if (distancePx <= COAST_ARRIVAL_PX) return null
        return {
            kind: 'coasting',
            from: releasePosition,
            to,
            startMs: now,
            durationMs: Math.log(distancePx / COAST_ARRIVAL_PX) / COAST_DECAY_PER_MS,
            publishedColumn: Math.floor(releasePosition)
        }
    }

    /** The pointer let go of a drag (stage or bottom timeline): flick if it was thrown, otherwise settle. */
    settleDrag = (mayCoast: boolean, samples: PointerSample[] = []) => {
        const motion = this.motion
        if (motion.kind !== 'dragging') return
        const {data} = this.props
        if (SMOOTH_SCROLL_ENABLED && mayCoast && !data.isPlaying && !data.isRecordingAudio) {
            const coast = this.coastFromRelease(motion.position, samples)
            if (coast) {
                this.motion = coast
                this.ensureFrames()
                return
            }
        }
        this.easeTo(motion.position, clamp(Math.round(motion.position), 0, data.columns.length - 1))
    }

    //the wheel's delta in screen pixels, whatever unit the browser reports it in
    wheelDeltaPx = (e: WheelEvent): number => {
        if (e.deltaMode === 1) return e.deltaY * WHEEL_LINE_PX
        if (e.deltaMode === 2) return e.deltaY * this.state.width
        return e.deltaY
    }
    cancelWheelSettle = () => {
        if (!this.wheelSettleTimeout) return
        clearTimeout(this.wheelSettleTimeout)
        this.wheelSettleTimeout = 0
    }
    //the wheel went quiet: settle on the nearest column
    settleWheel = () => {
        this.wheelSettleTimeout = 0
        const motion = this.motion
        if (motion.kind !== 'wheeling') return
        this.easeTo(motion.position, clamp(Math.round(motion.position), 0, this.props.data.columns.length - 1))
    }
    handleWheel = (e: WheelEvent) => {
        if (e.deltaY === 0 || this.motion.kind === 'dragging') return
        const {data, functions} = this.props
        const lastColumn = data.columns.length - 1
        //while playing (or recording) the song owns the position, one column per wheel event like it always was
        if (data.isPlaying || data.isRecordingAudio) {
            functions.selectColumn(clamp(data.selected + Math.sign(e.deltaY), 0, lastColumn), true)
            return
        }
        this.cancelWheelSettle()
        const deltaPx = this.wheelDeltaPx(e)
        const motion = this.motion
        const from = motion.kind === 'wheeling' ? motion.position : this.getScrollPosition()
        if (!SMOOTH_SCROLL_ENABLED || Math.abs(deltaPx) >= WHEEL_NOTCH_PX) {
            //a notch of a classic mouse wheel: one column per notch, notches in a row add up
            const base = motion.kind === 'easing' ? motion.to : Math.round(from)
            this.easeTo(from, clamp(base + Math.sign(deltaPx), 0, lastColumn))
            return
        }
        //a touchpad: its own deltas move the timeline directly, and a short pause settles it on a column
        const position = clamp(from + deltaPx / this.state.column.width, 0, lastColumn)
        if (motion.kind !== 'wheeling') this.publishedColumn = data.selected
        this.motion = {kind: 'wheeling', position}
        this.publishFloor(position)
        this.ensureFrames()
        this.wheelSettleTimeout = setTimeout(this.settleWheel, WHEEL_SETTLE_IDLE_MS)
    }
    handleClick = (e: FederatedPointerEvent, type: ClickEventType) => {
        const x = e.globalX
        const {width, numberOfColumnsPerCanvas} = this.state
        const {data} = this.props
        if (type === "up") {
            const wasSliding = this.sliderSelected
            this.sliderSelected = false
            if (wasSliding) this.settleDrag(false)
        }
        if (type === "down-slider") {
            this.sliderSelected = true
            this.cancelWheelSettle()
            const relativeColumnWidth = width / data.columns.length
            const stageSize = relativeColumnWidth * (numberOfColumnsPerCanvas + 1)
            const stagePosition = relativeColumnWidth * this.getScrollPosition() - (numberOfColumnsPerCanvas / 2) * relativeColumnWidth
            this.onSlider = x > stagePosition && x < stagePosition + stageSize
            this.sliderOffset = stagePosition + stageSize / 2 - x
            this.handleSliderSlide(e)
        }
    }
    handleClickStage = (e: FederatedPointerEvent) => {
        this.stageSelected = true
        this.cancelWheelSettle()
        this.dragStartX = e.globalX
        this.dragSamples = [{x: e.globalX, t: performance.now()}]
        //pressing on a flick that is still travelling grabs it: the timeline freezes right where it is
        if (this.motion.kind === 'coasting') {
            const position = this.getScrollPosition()
            this.motion = {kind: 'dragging', position}
            this.dragAnchorPosition = position
            this.publishedColumn = Math.floor(position)
            this.applyScroll(true)
        }
    }
    handleClickStageUp = (e: FederatedPointerEvent) => {
        const wasPressed = this.stageSelected
        const samples = this.dragSamples
        this.stageSelected = false
        this.dragSamples = []
        //a drag (or a grabbed flick) settles, it is never a click
        if (this.motion.kind === 'dragging') return this.settleDrag(true, samples)
        if (!wasPressed) return
        //the pointer never travelled: a click, pick the column under it
        const {data, functions} = this.props
        const {column, numberOfColumnsPerCanvas} = this.state
        const middle = (numberOfColumnsPerCanvas / 2) * column.width
        const clicked = Math.floor((e.globalX - middle) / column.width + 1 + this.getScrollPosition())
        const target = clamp(clicked, 0, data.columns.length - 1)
        if (target === data.selected) return
        functions.selectColumn(target)
    }

    handleClickDown = (e: FederatedPointerEvent) => {
        this.handleClick(e, "down-slider")
    }
    handleClickUp = (e: FederatedPointerEvent) => {
        this.handleClick(e, "up")
    }
    handleStageSlide = (e: FederatedPointerEvent) => {
        if (!this.stageSelected) return
        const x = e.globalX
        const now = performance.now()
        //the release speed is read from these, only the last FLICK_WINDOW_MS of them are kept
        this.dragSamples.push({x, t: now})
        while (this.dragSamples.length > 1 && this.dragSamples[0].t < now - FLICK_WINDOW_MS) this.dragSamples.shift()
        if (this.motion.kind !== 'dragging') {
            //a few pixels of jitter is still a click
            if (Math.abs(x - this.dragStartX) <= DRAG_SLOP_PX) return
            //the hand grabs what is on screen, so anchor on where the timeline is right now (a glide or a settle
            //may be moving it) and not on where it was when the press happened
            this.dragAnchorPosition = this.getScrollPosition()
            this.publishedColumn = this.props.data.selected
        }
        const lastColumn = this.props.data.columns.length - 1
        const raw = this.dragAnchorPosition + (this.dragStartX - x) / this.state.column.width
        const clamped = clamp(raw, 0, lastColumn)
        //re-anchor at either end, otherwise dragging past the end and back leaves a dead zone
        if (clamped !== raw) {
            this.dragStartX = x
            this.dragAnchorPosition = clamped
        }
        const position = SMOOTH_SCROLL_ENABLED ? clamped : Math.round(clamped)
        this.motion = {kind: 'dragging', position}
        this.publishFloor(position)
        this.ensureFrames()
    }
    handleBreakpoints = (direction: 1 | -1) => {
        const {selected, columns, breakpoints} = this.props.data
        const breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
            : breakpoints.filter((v) => v < selected).sort((a, b) => b - a)
        if (breakpoint.length === 0) return
        if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
            this.props.functions.selectColumn(breakpoint[0])
        }
    }
    handleSliderSlide = (e: FederatedPointerEvent) => {
        if (!this.sliderSelected) return
        const {width} = this.state
        const {data} = this.props
        const lastColumn = data.columns.length - 1
        if (lastColumn < 0) return
        this.hasSlided = true
        const relativeColumnWidth = width / data.columns.length
        const x = this.onSlider ? (e.globalX + this.sliderOffset) : e.globalX
        //the middle of the little window sits half a column after the position it stands for
        const raw = clamp(x / relativeColumnWidth - 0.5, 0, lastColumn)
        const position = SMOOTH_SCROLL_ENABLED ? raw : Math.round(raw)
        if (this.motion.kind !== 'dragging') this.publishedColumn = data.selected
        this.motion = {kind: 'dragging', position}
        this.publishFloor(position)
        this.ensureFrames()
    }
    testStageHitarea = {
        contains: (x: number, y: number) => {
            if (this.stageSelected) return true //if stage is selected, we want to be able to move it even if we are outside the timeline
            const width = this.state.column.width * this.props.data.columns.length
            if (x < 0 || x > width || y < 0 || y > this.state.height) return false
            return true
        }
    }
    testTimelineHitarea = {
        contains: (x: number, y: number) => {
            if (this.sliderSelected) return true //if slider is selected, we want to be able to move it even if we are outside the timeline
            if (x < 0 || x > this.state.width || y < 0 || y > this.state.timelineHeight) return false
            return true
        }
    }

    render() {
        const {width, timelineHeight, height, theme, numberOfColumnsPerCanvas, stageOptions} = this.state
        const {data, functions} = this.props
        const cache = this.state.cache?.cache
        const sizes = this.state.column
        this.syncMotionWithProps()
        const scrollPosition = this.getScrollPosition()
        this.lastShownPosition = scrollPosition
        this.lastAppliedPosition = scrollPosition
        const xPosition = (scrollPosition - numberOfColumnsPerCanvas / 2 + 1) * -sizes.width
        const beatMarks = Number(data.settings.beatMarks.value)
        const counterLimit = beatMarks === 0 ? 12 : 4 * beatMarks
        const relativeColumnWidth = width / data.columns.length
        const timelineWidth = Math.floor(relativeColumnWidth * (width / sizes.width + 1))
        const timelinePosition = relativeColumnWidth * scrollPosition - relativeColumnWidth * (numberOfColumnsPerCanvas / 2)
        const isBreakpointSelected = data.breakpoints.includes(data.selected)
        const sideColor = theme.sideButtons.rgb
        const {t} = this.props
        return <div
            className={"canvas-wrapper " + (data.inPreview ? "canvas-wrapper-in-preview" : "")}
            style={{
                width,
                backgroundColor: cache ? "unset" : theme.main.backgroundHex
            }}
        >
            <div className='canvas-relative'>
                <Stage
                    width={width}
                    height={height}
                    raf={false}
                    onMount={this.recalculateCacheAndSizes}
                    style={{opacity: theme.main.backgroundOpacity}}
                    renderOnComponentChange={true}
                    options={stageOptions}
                    ref={this.notesStageRef}
                >
                    {(cache && !data.isRecordingAudio) && <Container
                        ref={this.notesContainerRef}
                        x={xPosition}
                        eventMode='static'
                        pointerdown={this.handleClickStage}
                        pointerup={this.handleClickStageUp}
                        pointermove={this.handleStageSlide}
                        interactiveChildren={false}
                        hitArea={this.testStageHitarea}
                    >
                        {data.columns.map((column, i) => {
                            //+4: the timeline can be drawn up to a column away from `selected`, and a fast flick
                            //can be a couple of frames ahead of React, so keep a few extra columns around
                            if (!isColumnVisible(i, data.selected, numberOfColumnsPerCanvas + 4)) return null
                            const tempoChangersCache = (i + 1) % 4 === 0 ? cache.columnsLarger : cache.columns
                            const standardCache = (i + 1) % 4 === 0 ? cache.standardLarger : cache.standard
                            const background = column.tempoChanger === 0
                                ? standardCache[Number(i % (counterLimit * 2) >= counterLimit)]
                                : tempoChangersCache[column.tempoChanger]
                            return <RenderColumn
                                cache={cache}
                                key={i}
                                notes={column.notes}
                                index={i}
                                sizes={sizes}
                                instruments={data.song.instruments}
                                currentLayer={data.currentLayer}
                                backgroundCache={background}
                                isToolsSelected={data.selectedColumns.includes(i)}
                                isSelected={i === data.selected}
                                isBreakpoint={data.breakpoints.includes(i)}
                                sheetId={data.song.id ?? data.song.name}
                                deviceId={devicePermissionStore.state.deviceId}
                                notesVisible={showRealNotes(data.song, devicePermissionStore.state.notesVisible)}
                            />
                        })}
                    </Container>
                    }
                </Stage>
                {!data.settings.useKeyboardSideButtons.value && <>
                    <button
                        onPointerDown={() => functions.selectColumn(data.selected - 1)}
                        className={`canvas-buttons ${!data.isPlaying ? 'canvas-buttons-visible' : ''}`}
                        style={{
                            left: '0',
                            paddingRight: '0.5rem',
                            justifyContent: "flex-start",
                            background: `linear-gradient(90deg, rgba(${sideColor},0.80) 30%, rgba(${sideColor},0.30) 80%, rgba(${sideColor},0) 100%)`
                        }}
                    >
                        <FaChevronLeft/>
                    </button>
                    <button
                        onPointerDown={() => functions.selectColumn(data.selected + 1)}
                        className={`canvas-buttons ${!data.isPlaying ? 'canvas-buttons-visible' : ''}`}
                        style={{
                            right: '0',
                            paddingLeft: '0.5rem',
                            justifyContent: "flex-end",
                            background: `linear-gradient(270deg, rgba(${sideColor},0.80) 30%, rgba(${sideColor},0.30) 80%, rgba(${sideColor},0) 100%)`
                        }}
                    >
                        <FaChevronRight/>
                    </button>
                </>}
            </div>
            <div className="timeline-wrapper-bg row">

                <div className="timeline-wrapper" style={{height: this.state.timelineHeight}}>
                    <TimelineButton
                        onClick={() => this.handleBreakpoints(-1)}
                        tooltip={t('previous_breakpoint')}
                        style={{
                            backgroundColor: theme.timeline.hex
                        }}
                        ariaLabel={t('previous_breakpoint')}
                    >
                        <MemoizedIcon icon={FaStepBackward} size={16}/>
                    </TimelineButton>
                    <TimelineButton
                        onClick={() => this.handleBreakpoints(1)}
                        tooltip={t('next_breakpoint')}
                        style={{
                            marginLeft: 0,
                            backgroundColor: theme.timeline.hex
                        }}
                        ariaLabel={t('next_breakpoint')}
                    >
                        <MemoizedIcon icon={FaStepForward} size={16}/>
                    </TimelineButton>

                    <div className='timeline-scroll' style={{backgroundColor: theme.timeline.hex}}>
                        <Stage
                            width={width}
                            height={timelineHeight}
                            options={this.state.timelineOptions}
                            raf={false}
                            ref={this.breakpointsStageRef}
                            renderOnComponentChange={true}
                        >
                            {cache && <Container
                                width={width}
                                height={timelineHeight}
                                eventMode='static'
                                pointerdown={this.handleClickDown}
                                pointerup={this.handleClickUp}
                                pointermove={this.handleSliderSlide}
                                interactiveChildren={false}
                                hitArea={this.testTimelineHitarea}
                            >
                                <Graphics //to fill the space
                                    draw={(g) => {
                                        g.clear()
                                        g.beginFill(theme.timeline.hexNumber)
                                        g.drawRect(0, 0, width, timelineHeight)
                                    }}
                                />
                                {data.selectedColumns.length
                                    ? <Graphics
                                        draw={(g) => {
                                            const first = data.selectedColumns[0] || 0
                                            const last = data.selectedColumns[data.selectedColumns.length - 1]
                                            const x = first * relativeColumnWidth
                                            const xEnd = last * relativeColumnWidth
                                            const width = xEnd - x
                                            g.clear()
                                            g.beginFill(theme.timeline.selected, 0.6)
                                            g.drawRect(x, 0, width, timelineHeight)
                                        }}
                                    />
                                    : null
                                }
                                <ComposerBreakpointsRenderer
                                    breakpoints={data.breakpoints}
                                    texture={cache.breakpoints[0]}
                                    width={width}
                                    columns={data.columns.length}
                                />
                            </Container>
                            }
                            <Graphics //current visible columns
                                draw={(g) => {
                                    g.clear()
                                    g.lineStyle(3, theme.timeline.border, 0.8)
                                    g.drawRoundedRect(0, 0, timelineWidth, timelineHeight - 3, 6)
                                }}
                                ref={this.timelineCursorRef}
                                x={timelinePosition}
                                y={1.5}
                            />
                        </Stage>
                    </div>
                    <TimelineButton
                        onClick={functions.toggleBreakpoint}
                        style={{
                            backgroundColor: theme.timeline.hex
                        }}
                        tooltip={isBreakpointSelected ? t('remove_breakpoint') : t('add_breakpoint')}
                        ariaLabel={isBreakpointSelected ? t('remove_breakpoint') : t('add_breakpoint')}
                    >
                        <MemoizedIcon icon={isBreakpointSelected ? FaMinusCircle : FaPlusCircle} size={16}/>
                    </TimelineButton>
                </div>
            </div>
        </div>
    }
}