'use client'

import { Pause, Play, RotateCcw, SkipForward, Satellite, Ship, Waves, Radio, ScanLine, Route, FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WINDOW_HOURS } from '@/lib/nauticeye/demo-data'

export const INVESTIGATION_STAGES = [
  { hour: 0, label: 'AIS HISTORY', detail: 'VESSEL TRANSIT', icon: Ship },
  { hour: 10, label: 'INCIDENT', detail: 'VESSEL SINKS', icon: Waves },
  { hour: 20, label: 'SAR ACQUISITION', detail: 'SCAN', icon: Satellite },
  { hour: 28, label: 'SEGMENTATION', detail: 'OIL DETECTED', icon: ScanLine },
  { hour: 38, label: 'DRIFT RECONSTRUCTION', detail: 'ESE DRIFT', icon: Waves },
  { hour: 48, label: 'AIS CORRELATION', detail: 'TRACK MATCH', icon: Route },
  { hour: 56, label: 'INVESTIGATION', detail: 'LEAD', icon: FileSearch },
] as const

export const getInvestigationStage = (value: number) => {
  let index = 0
  for (let i = 0; i < INVESTIGATION_STAGES.length; i += 1) {
    if (value >= INVESTIGATION_STAGES[i].hour) index = i
  }
  return { index, ...INVESTIGATION_STAGES[index] }
}

export const getNextStageHour = (value: number) => INVESTIGATION_STAGES.find(s => s.hour > value)?.hour ?? WINDOW_HOURS


export function Timeline({ value, onChange, playing, onPlay, speed, onSpeed, referenceTime }: { value: number; onChange: (value: number) => void; playing: boolean; onPlay: () => void; speed: number; onSpeed: () => void; referenceTime: number }) {
  const stamp = new Date(referenceTime - (WINDOW_HOURS - value) * 3600000)
  const stage = getInvestigationStage(value)

  return <section className="timeline-dock" aria-label="Historical MSC ELSA 3 playback timeline">
    <div className="timeline-heading">
      <span className="eyebrow"><span className={playing ? 'status-dot' : 'status-dot paused'} />HISTORICAL PLAYBACK</span>
      <div className="timeline-stamp"><strong>{stamp.toISOString().slice(11, 16)}</strong><span>UTC / {stamp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase()}</span></div>
      <span className="timeline-stage"><b>0{stage.index + 1}</b>{stage.label}<small>{stage.detail}</small></span>
    </div>
    <div className="playback-buttons">
      <Button size="icon" variant="ghost" onClick={() => onChange(0)} aria-label="Rewind to 25 May"><RotateCcw /></Button>
      <Button size="icon-lg" onClick={onPlay} aria-label={playing ? 'Pause historical playback' : 'Play historical playback'}>{playing ? <Pause /> : <Play />}</Button>
      <Button size="icon" variant="ghost" onClick={() => onChange(WINDOW_HOURS)} aria-label="Jump to investigation"><SkipForward /></Button>
    </div>
    <div className="timeline-instrument">
      <div className="timeline-events" aria-label="Incident stages">
        {INVESTIGATION_STAGES.map((event, index) => { const Icon = event.icon; return <button key={`${event.hour}-${event.detail}`} style={{ left: `${event.hour / WINDOW_HOURS * 100}%` }} title={`${event.label} — ${event.detail}`} aria-label={`${event.label} ${event.detail}`} onClick={() => onChange(event.hour)} className={value >= event.hour ? 'occurred' : ''}>
          <Icon size={12} /><span>{String(index + 1).padStart(2, '0')} {event.detail}</span>
        </button> })}
      </div>
      <div className="timeline-ruler"><div className="timeline-progress" style={{ width: `${value / WINDOW_HOURS * 100}%` }} /><input aria-label="Historical incident time" type="range" min="0" max={WINDOW_HOURS} step="0.1" value={value} onChange={e => onChange(Number(e.target.value))} /></div>
      <div className="timeline-labels"><span>25 MAY</span><span>26 MAY</span><span>27 MAY</span></div>
    </div>
    <div className="timeline-end"><button onClick={onSpeed} aria-label={`Replay speed ${speed} times; change speed`}>{speed}× <span>PLAYBACK</span></button><span className="eyebrow">MSC ELSA 3 · STEP-BY-STEP RECONSTRUCTION</span></div>
  </section>
}
