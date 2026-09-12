import {CACHE_DATA, NOTES_PER_COLUMN, TEMPO_CHANGERS} from "$config"
import Color from "color"
import {LINE_SCALE_MODE, settings, SmoothGraphics as Graphics} from '@pixi/graphics-smooth';
import {Application, Rectangle, SCALE_MODES, Texture} from 'pixi.js'
import {NoteLayer} from "$lib/Songs/Layer";

settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NORMAL
const {horizontalLineBreak, standards, layersCombination, breakpoints} = CACHE_DATA

interface ComposerCacheProps {
    width: number
    height: number
    margin: number
    timelineHeight: number
    app: Application
    breakpointsApp: Application
    colors: {
        accent: Color,
        mainLayer: Color,
        secondLayer: Color,
        bars: typeof standards
    }
    currentLayer?: number
}

export type ComposerCacheData = {
    columns: Texture[]
    notes: {
        [key in string]: Texture
    }
    standard: Texture[]
    columnsLarger: Texture[]
    standardLarger: Texture[]
    breakpoints: Texture[]
}

export class ComposerCache {
    width: number
    height: number
    cache: ComposerCacheData
    timelineHeight: number
    margin: number
    noteWidth: number
    noteHeight: number
    app: Application | null
    breakpointsApp: Application | null
    colors: {
        accent: Color,
        mainLayer: Color,
        secondLayer: Color,
        bars: { color: number }[]
    }
    currentLayer: number

    constructor({
                    width,
                    height,
                    margin = 4,
                    timelineHeight = 30,
                    app,
                    breakpointsApp,
                    colors,
                    currentLayer = 0
                }: ComposerCacheProps) {

        this.cache = {
            columns: [],
            notes: {},
            standard: [],
            columnsLarger: [],
            standardLarger: [],
            breakpoints: []
        }
        this.width = width
        this.height = height
        this.timelineHeight = timelineHeight
        this.margin = margin
        this.noteWidth = this.width
        this.noteHeight = this.height / NOTES_PER_COLUMN
        this.colors = colors
        this.currentLayer = currentLayer
        this.app = app
        this.breakpointsApp = breakpointsApp
        this.generate()
    }

    destroy = () => {
        this.cache.columns.forEach(e => e.destroy(true))
        this.cache.standard.forEach(e => e.destroy(true))
        this.cache.columnsLarger.forEach(e => e.destroy(true))
        this.cache.standardLarger.forEach(e => e.destroy(true))
        this.cache.breakpoints.forEach(e => e.destroy(true))
        Object.values(this.cache.notes).forEach(e => e.destroy(true))
        this.app = null
        this.breakpointsApp = null
    }
    setCurrentLayer = (layer: number) => {
        if (this.currentLayer === layer) return
        this.currentLayer = layer
        this.cache.columns.forEach(e => e.destroy(true)); this.cache.columns = []
        this.cache.standard.forEach(e => e.destroy(true)); this.cache.standard = []
        this.cache.columnsLarger.forEach(e => e.destroy(true)); this.cache.columnsLarger = []
        this.cache.standardLarger.forEach(e => e.destroy(true)); this.cache.standardLarger = []
        this.cache.breakpoints.forEach(e => e.destroy(true)); this.cache.breakpoints = []
        Object.values(this.cache.notes).forEach(e => e.destroy(true)); this.cache.notes = {}
        this.generate()
    }
    generate = () => {
        TEMPO_CHANGERS.forEach(tempoChanger => {
            const texture = this.drawColumn(tempoChanger, 1)
            if (texture) this.cache.columns.push(texture)
        })
        this.colors.bars.forEach(standardColumn => {
            const texture = this.drawColumn(standardColumn, 1)
            if (texture) this.cache.standard.push(texture)
        })
        this.colors.bars.forEach(standardColumn => {
            const texture = this.drawColumn(standardColumn, 3)
            if (texture) this.cache.standardLarger.push(texture)
        })
        layersCombination.forEach(note => {
            const noteWidth = this.noteWidth
            const noteHeight = this.noteHeight
            const radius = this.noteWidth > 20 ? 3 : 2
            const layer = new NoteLayer(note)
            const g = new Graphics()
            const LAYER_COLORS = [0x6ee781, 0xffc46e, 0x6ea8ff, 0xff6e9c]
            const shapeCx = noteWidth / 2 - 0.25
            const shapeCy = noteHeight / 2
            const shapeSize = Math.min(noteWidth, noteHeight) / 2 - this.margin / 2
            const drawStarShape = (color: number, filled: boolean) => {
                const points: number[] = []
                const spikes = 5
                const outerR = shapeSize
                const innerR = shapeSize * 0.45
                let rot = Math.PI / 2 * 3
                const step = Math.PI / spikes
                for (let i = 0; i < spikes; i++) {
                    points.push(shapeCx + Math.cos(rot) * outerR, shapeCy + Math.sin(rot) * outerR)
                    rot += step
                    points.push(shapeCx + Math.cos(rot) * innerR, shapeCy + Math.sin(rot) * innerR)
                    rot += step
                }
                if (filled) g.beginFill(color).lineStyle(1, color).drawPolygon(points).endFill()
                else g.lineStyle(2, color).drawPolygon(points)
            }
            const drawSquareShape = (color: number, filled: boolean) => {
                const half = shapeSize * 0.9
                if (filled) g.beginFill(color).lineStyle(1, color).drawRoundedRect(shapeCx - half, shapeCy - half, half * 2, half * 2, 2).endFill()
                else g.lineStyle(2, color).drawRoundedRect(shapeCx - half, shapeCy - half, half * 2, half * 2, 2)
            }
            const drawTriangleShape = (color: number, filled: boolean) => {
                const points = [
                    shapeCx, shapeCy - shapeSize,
                    shapeCx + shapeSize * 0.866, shapeCy + shapeSize * 0.5,
                    shapeCx - shapeSize * 0.866, shapeCy + shapeSize * 0.5
                ]
                if (filled) g.beginFill(color).lineStyle(1, color).drawPolygon(points).endFill()
                else g.lineStyle(2, color).drawPolygon(points)
            }
            const drawLayerShape = (shapeIndex: number, color: number, filled: boolean) => {
                if (shapeIndex === 0) { //layer 1: circle
                    if (filled) g.beginFill(color).lineStyle(1, color).drawCircle(shapeCx, shapeCy, shapeSize).endFill()
                    else g.lineStyle(2, color).drawCircle(shapeCx, shapeCy, shapeSize)
                } else if (shapeIndex === 1) { //layer 2: star
                    drawStarShape(color, filled)
                } else if (shapeIndex === 2) { //layer 3: square
                    drawSquareShape(color, filled)
                } else { //layer 4: triangle
                    drawTriangleShape(color, filled)
                }
            }
            const presentLayers = [0, 1, 2, 3].filter(i => layer.test(i))
            presentLayers.forEach((layerIndex) => {
                drawLayerShape(layerIndex, LAYER_COLORS[layerIndex], layerIndex === this.currentLayer)
            })
            if (!this.app) return
            const texture = this.app.renderer.generateTexture(g, {
                resolution: 2,
                scaleMode: SCALE_MODES.LINEAR,
                region: new Rectangle(0, 0, this.noteWidth, this.noteHeight)
            });
            this.cache.notes[note] = texture
            g.destroy(true)
        })
        TEMPO_CHANGERS.forEach(tempoChanger => {
            const texture = this.drawColumn(tempoChanger, 2)
            if (texture) this.cache.columnsLarger.push(texture)
        })
        breakpoints.forEach(breakpoint => {
            const g = new Graphics()
            const size = this.timelineHeight / 6
            if (breakpoint.type === "short") {
                g.beginFill(this.colors.accent.rgbNumber())
                g.drawCircle(
                    size,
                    this.timelineHeight / 2,
                    size
                ).endFill()
                if (!this.breakpointsApp) return
                const texture = this.breakpointsApp.renderer.generateTexture(g, {
                    scaleMode: SCALE_MODES.LINEAR,
                    resolution: 2,
                    region: new Rectangle(0, 0, size * 2, this.timelineHeight)
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            } else {
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(0, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(0, this.height - this.noteHeight)
                    .endFill();
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(this.width, this.height)
                    .lineTo(this.noteWidth / 2, this.height)
                    .lineTo(this.width, this.height - this.noteHeight)
                    .endFill();
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(0, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(0, this.noteHeight)
                    .endFill();
                g.beginFill(this.colors.accent.rgbNumber())
                    .moveTo(this.width, 0)
                    .lineTo(this.noteWidth / 2, 0)
                    .lineTo(this.width, this.noteHeight)
                    .endFill();
                if (!this.app) return
                const texture = this.app.renderer.generateTexture(g, {
                    scaleMode: SCALE_MODES.LINEAR,
                    resolution: 2
                });
                this.cache.breakpoints.push(texture)
                g.destroy(true)
            }
        })
    }
    drawColumn = (data: { color: number }, borderWidth: number) => {
        const g = new Graphics()
        g.beginFill(data.color)
        g.drawRect(0, 0, this.width, this.height)
        g.lineStyle(borderWidth, borderWidth === 2 ? 0x333333 : 0x333333)
            .moveTo(this.width, 0)
            .lineTo(this.width, this.height)
        g.lineStyle(1, 0x333333)
        for (let i = 1; i < 3; i++) {
            const y = this.noteHeight * horizontalLineBreak * i
            g.moveTo(0, y)
            g.lineTo(this.width, y)
        }
        if (!this.app) return
        const texture = this.app.renderer.generateTexture(g, {
            scaleMode: SCALE_MODES.LINEAR,
            resolution: window?.devicePixelRatio || 1,
            region: new Rectangle(0, 0, this.width, this.height)
        })
        g.destroy(true)
        return texture
    }
}
