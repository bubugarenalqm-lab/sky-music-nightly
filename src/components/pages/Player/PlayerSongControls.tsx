import {SPEED_CHANGERS} from "$config"
import {MemoizedIcon} from "$cmp/shared/Utility/Memoized";
import {FaEye, FaEyeSlash, FaStop, FaPlay, FaStepBackward, FaStepForward, FaRandom} from "react-icons/fa";
import {memo, useCallback, useEffect, useMemo, useState} from "react";
import {playerStore} from "$stores/PlayerStore";
import {playerControlsStore} from "$stores/PlayerControlsStore";
import {IconButton} from "$cmp/shared/Inputs/IconButton";
import {useObservableObject} from "$lib/Hooks/useObservable";
import {GiMetronome} from "react-icons/gi";
import {PlayerTimeline} from "./PlayerTimeline";
import {PlayerVisualSheetRenderer} from "./PlayerPagesRenderer";
import s from './Slider.module.css'
import svs from './VisualSheet.module.css'
import {useTranslation} from "react-i18next";
import {VscDebugRestart} from "react-icons/vsc";
import type {ChangeEvent} from "react";

interface PlayerSongControlsProps {
    onRestart: (index?: number) => void
    onRawSpeedChange: (event: ChangeEvent<HTMLSelectElement>) => void
    onToggleRecordAudio: (override: boolean) => void
    onToggleMetronome: () => void
    speedChanger: typeof SPEED_CHANGERS[number]
    loopEnabled: boolean

    hidePracticeNotes: boolean | undefined
    setHidePracticeNotes: (hide: boolean) => void
    setLoopEnabled: (enabled: boolean) => void
    isVisualSheetVisible: boolean
    visualSheetColumns: number
    hasSong: boolean
    isMetronomePlaying: boolean
    isRecordingAudio: boolean

    onPlayNext?: () => void
    onPlayPrev?: () => void
    onToggleRandom?: () => void
    isRandomMode?: boolean
}

function _PlayerSongControls({
                                 onRestart,
                                 hasSong,
                                 isMetronomePlaying,
                                 onToggleMetronome,
                                 isVisualSheetVisible,
                                 visualSheetColumns,
                                 hidePracticeNotes,
                                 setHidePracticeNotes,
                                 onPlayNext,
                                 onPlayPrev,
                                 onToggleRandom,
                                 isRandomMode,
                             }: PlayerSongControlsProps) {
    const [needsRefresh, setNeedsRefresh] = useState(false)
    const songData = useObservableObject(playerStore.state)
    const {t} = useTranslation(["player", 'common', "settings", "shortcuts"])

    const toggleNeedsRefresh = useCallback(() => {
        setNeedsRefresh(true)
    }, [])

    useEffect(() => {
        setNeedsRefresh(false)
    }, [songData.key]);

    const activeSong = songData.song ?? songData.pausedSong
    const notes = useMemo(() => {
        if (!activeSong) return []
        // ComposedSong keeps its own `.notes` array empty; the real timed notes
        // only exist after converting it to a RecordedSong. Without this,
        // the timeline duration/current time always computed as 0 -> "0:00".
        return activeSong.isComposed ? activeSong.toRecordedSong().notes : activeSong.notes
    }, [activeSong])

    return <>
        {(songData.song || songData.pausedSong) &&
            <div className="song-info">
                <div className='text-ellipsis'>
                    {(songData.song ?? songData.pausedSong)!.name}
                </div>
                {(songData.shopSheetMeta ?? songData.pausedShopSheetMeta)?.author && <div className='text-ellipsis'>Author: {(songData.shopSheetMeta ?? songData.pausedShopSheetMeta)!.author}</div>}
                {(songData.shopSheetMeta ?? songData.pausedShopSheetMeta) && <div className='text-ellipsis'>Transcribed: {(songData.shopSheetMeta ?? songData.pausedShopSheetMeta)!.transcribedBy}</div>}
                <div>BPM: {(songData.shopSheetMeta ?? songData.pausedShopSheetMeta)?.bpm ?? ((songData.song ?? songData.pausedSong) as any).bpm}</div>
            </div>
        }
        {songData.eventType === 'approaching' &&
            <Score/>
        }
        <div className={`column ${svs['player-controls']}`}>
            <div
                className={`row ${s['timeline-row']}`}
                style={!hasSong ? {display: 'none'} : {gap: '0.8rem', alignItems: 'stretch'}}
            >
                <div className={`column ${s['nav-column']}`}>
                    {hidePracticeNotes !== undefined &&
                        <IconButton
                            onClick={() => setHidePracticeNotes(!hidePracticeNotes)}
                            tooltip={t('hide_practice_notes')}
                            toggled={hidePracticeNotes}
                            ariaLabel={t("hide_practice_notes")}
                        >
                            {hidePracticeNotes
                                ? <MemoizedIcon icon={FaEyeSlash}/>
                                : <MemoizedIcon icon={FaEye}/>
                            }
                        </IconButton>
                    }
                    {onPlayPrev &&
                        <IconButton
                            onClick={onPlayPrev}
                            tooltip={t('previous_song', {defaultValue: 'Previous song'})}
                            ariaLabel={t('previous_song', {defaultValue: 'Previous song'})}
                        >
                            <MemoizedIcon icon={FaStepBackward}/>
                        </IconButton>
                    }
                    <IconButton
                        onClick={() => {
                            if (songData.pausedSong) {
                                playerStore.resume()
                            } else {
                                playerStore.pause(playerControlsStore.current, playerControlsStore.end)
                            }
                        }}
                        tooltip={songData.pausedSong ? t('common:play') : t('common:stop')}
                        ariaLabel={songData.pausedSong ? t("common:play") : t("stop_song")}
                    >
                        <MemoizedIcon icon={songData.pausedSong ? FaPlay : FaStop}/>
                    </IconButton>
                    {onPlayNext &&
                        <IconButton
                            onClick={onPlayNext}
                            tooltip={t('next_song', {defaultValue: 'Next song'})}
                            ariaLabel={t('next_song', {defaultValue: 'Next song'})}
                        >
                            <MemoizedIcon icon={FaStepForward}/>
                        </IconButton>
                    }
                    {onToggleRandom &&
                        <IconButton
                            toggled={isRandomMode}
                            onClick={onToggleRandom}
                            tooltip={t('random_song', {defaultValue: 'Random from library'})}
                            ariaLabel={t('random_song', {defaultValue: 'Random from library'})}
                        >
                            <MemoizedIcon icon={FaRandom}/>
                        </IconButton>
                    }
                    <IconButton
                        toggled={needsRefresh}
                        onClick={() => onRestart()}
                        tooltip={t('shortcuts:props.restart')}
                        ariaLabel={t("shortcuts:props.restart_description")}
                    >
                        <MemoizedIcon icon={VscDebugRestart}/>
                    </IconButton>
                </div>

                <PlayerTimeline
                    notes={notes}
                    onSeek={(index) => onRestart(index)}
                    onChange={toggleNeedsRefresh}
                />
            </div>

            <IconButton
                toggled={isMetronomePlaying}
                onClick={onToggleMetronome}
                className={`${s['sidebar-metronome-button']} metronome-button`}
                ariaLabel={t('settings:toggle_metronome')}
            >
                <GiMetronome size={22}/>
            </IconButton>
        </div>
        {isVisualSheetVisible &&
            <PlayerVisualSheetRenderer
                columns={visualSheetColumns}
            />
        }
    </>
}

export const PlayerSongControls = memo(_PlayerSongControls, (prev, next) => {
    return prev.speedChanger === next.speedChanger && prev.hasSong === next.hasSong && prev.isMetronomePlaying === next.isMetronomePlaying
        && prev.isRecordingAudio === next.isRecordingAudio && prev.isVisualSheetVisible === next.isVisualSheetVisible && prev.visualSheetColumns === next.visualSheetColumns
        && prev.loopEnabled === next.loopEnabled && prev.hidePracticeNotes === next.hidePracticeNotes && prev.isRandomMode === next.isRandomMode
})


function _Score() {
    const {t} = useTranslation("player")
    const {combo, score, correct, wrong} = useObservableObject(playerControlsStore.score)
    return <div className='approaching-accuracy'>
        <table>
            <tbody>
            <tr>
                <td className='sc-2'>{t("accuracy")}</td>
                <td className='sc-1'>{(correct / (correct + wrong - 1) * 100).toFixed(1)}%</td>
            </tr>
            <tr>
                <td className='sc-2'>{t("score")}</td>
                <td className='sc-1'>{score}</td>
            </tr>
            <tr>
                <td className='sc-2'>{t("combo")}</td>
                <td className='sc-1'>{combo}</td>
            </tr>
            </tbody>
        </table>
    </div>
}

const Score = memo(_Score, () => true)