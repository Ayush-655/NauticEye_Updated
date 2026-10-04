'use client'

import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Compass, Crosshair, Flag, Route, Ship, X, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SarView } from './sar-view'
import { DriftAnalysis, InvestigationStatus, LocationDashboard } from './investigation-hud'
import { angleDiff, bearingDeg, closestApproach, rankVessels } from '@/lib/nauticeye/engine'
import { ExportDialog } from './export-dialog'
import type { Spill, Vessel, RankedVessel } from '@/lib/nauticeye/types'
import { cn } from '@/lib/utils'

function VesselEvidence({ entry, spill, expanded, onExpand, trackOn, onTrack, flagged, onFlag, onSeek }: { entry: RankedVessel; spill: Spill; expanded: boolean; onExpand: () => void; trackOn: boolean; onTrack: () => void; flagged: boolean; onFlag: () => void; onSeek: (stamp: number) => void }) {
  const { vessel, score } = entry
  const ca = closestApproach(vessel, spill)
  const heading = angleDiff(ca.course, bearingDeg(ca.lat, ca.lng, spill.lat, spill.lng))
  return <article className={cn('vessel-evidence', expanded && 'expanded')}>
    <button className="vessel-summary" onClick={onExpand} aria-expanded={expanded} aria-label={`Inspect ${vessel.name}`}>
      <span className="vessel-symbol"><Ship size={14} /></span>
      <span><strong>{vessel.name}</strong><small>{vessel.flag} · {vessel.type}</small></span>
      <b className={score.overall >= 70 ? 'strong-score' : ''}>{score.overall}<small>%</small></b>
      <ChevronDown size={12} />
    </button>
    {expanded && <div className="vessel-detail compact-detail">
      <div className="evidence-id">MMSI {vessel.mmsi}<span>{flagged ? 'FLAGGED' : 'AIS HISTORY'}</span></div>
      <div className="evidence-factor-row">
        <span>Proximity <b>{score.proximity}</b></span><span>Time <b>{score.timeScore}</b></span><span>Course <b>{score.courseScore}</b></span>
      </div>
      <div className="evidence-measures"><div><b>{score.distKm.toFixed(1)}<small> km</small></b><span>Closest approach</span></div><div><b>{score.timeDiffH.toFixed(1)}<small> h</small></b><span>Time offset</span></div><div><b>{heading.toFixed(0)}<small>°</small></b><span>Heading diff.</span></div></div>
      <div className="evidence-actions"><Button variant={trackOn ? 'secondary' : 'outline'} size="sm" onClick={onTrack}><Route data-icon="inline-start" />{trackOn ? 'Clear track' : 'Highlight track'}</Button><Button variant={flagged ? 'secondary' : 'outline'} size="sm" onClick={onFlag} disabled={vessel.flagged}><Flag data-icon="inline-start" />{flagged ? 'Flagged' : 'Flag'}</Button></div>
      <button className="approach-replay" onClick={() => onSeek(ca.atTime)}><Clock3 size={12} />Jump to closest approach<ArrowRight size={12} /></button>
    </div>}
  </article>
}

export function AnalysisPanel({ spill, vessels, vesselId, onVessel, highlights, onTrack, flags, onFlag, onClose, onTour, caseIndex, caseCount, referenceTime, replayTime, onSeek, lightweight, pending, onReplay }: { spill: Spill; vessels: Vessel[]; vesselId: string | null; onVessel: (id: string | null) => void; highlights: string[]; onTrack: (id: string) => void; flags: Record<string, boolean>; onFlag: (id: string) => void; onClose: () => void; onTour: (delta: number) => void; caseIndex: number; caseCount: number; referenceTime: number; replayTime: number; onSeek: (stamp: number) => void; lightweight: boolean; pending: boolean; onReplay: () => void }) {
  const ranked = useMemo(() => rankVessels(spill, vessels), [spill, vessels])
  const [showAll, setShowAll] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [raw, setRaw] = useState(false)
  const lead = vesselId ? ranked.find(entry => entry.vessel.id === vesselId) ?? ranked[0] : ranked[0]
  const visibleCandidates = showAll ? ranked : ranked.slice(0, 3)

  return <aside className="analysis-panel" aria-label="Incident investigation">
    <div className="analysis-topline"><span className="eyebrow"><Crosshair size={12} /> INCIDENT INTELLIGENCE</span><Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close investigation"><X /></Button></div>
    <InvestigationStatus spill={spill} vessel={vesselId ? vessels.find(v => v.id === vesselId) ?? null : null} />
    <div className="analysis-title"><span className={cn('case-state', spill.status)}>{spill.status === 'resolved' ? 'RESOLVED' : spill.status === 'review' ? 'ANALYST REVIEW' : 'ACTIVE DETECTION'}</span><h2>{spill.name}</h2><p>{spill.lat.toFixed(3)}° N <span>/</span> {spill.lng.toFixed(3)}° E</p></div>
    <div className="case-navigation"><Button variant="ghost" size="icon-sm" onClick={() => onTour(-1)} aria-label="Previous case"><ArrowLeft /></Button><span>CASE {String(caseIndex + 1).padStart(2, '0')} <i>/</i> {String(caseCount).padStart(2, '0')}</span><Button variant="ghost" size="icon-sm" onClick={() => onTour(1)} aria-label="Next case"><ArrowRight /></Button></div>

    <div className="analysis-scroll">
      {pending && <p className="data-notice" role="status">Not yet detected at this replay time.</p>}
      <Tabs defaultValue="evidence">
        <TabsList variant="line" className="w-full"><TabsTrigger value="evidence">Investigation</TabsTrigger><TabsTrigger value="details">Details</TabsTrigger></TabsList>
        <TabsContent value="evidence">
          <section className="investigation-summary">
            <div className="summary-heading"><div><span className="eyebrow">DETECTION</span><h3>Spill signal</h3></div><b>{spill.confidence}%</b></div>
            <div className="summary-grid"><div><b>{spill.area}<small> km²</small></b><span>Estimated area</span></div><div><b>{new Date(spill.detectedAt).toISOString().slice(11, 16)}<small> UTC</small></b><span>Detected time</span></div><div><b>{spill.satellite.replace(' (simulated)', '')}</b><span>Source</span></div></div>
          </section>

          <section className="lead-card">
            <div className="section-heading"><h3><Ship size={13} /> Investigation lead</h3><span className="count-label">{ranked.length} TRACKS</span></div>
            {lead ? <>
              <button className="lead-vessel" onClick={() => onVessel(lead.vessel.id)}><span className="vessel-symbol"><Ship size={15} /></span><span><strong>{lead.vessel.name}</strong><small>{lead.vessel.flag} · {lead.vessel.type} · MMSI {lead.vessel.mmsi}</small></span><b>{lead.score.overall}<small>%</small></b><ArrowRight size={13} /></button>
              <div className="lead-factors"><span><i style={{ width: `${lead.score.proximity}%` }} /><small>Proximity</small><b>{lead.score.proximity}</b></span><span><i style={{ width: `${lead.score.timeScore}%` }} /><small>Time match</small><b>{lead.score.timeScore}</b></span><span><i style={{ width: `${lead.score.courseScore}%` }} /><small>Course</small><b>{lead.score.courseScore}</b></span></div>
              <div className="lead-actions"><Button variant={highlights.includes(lead.vessel.id) ? 'secondary' : 'outline'} size="sm" onClick={() => onTrack(lead.vessel.id)}><Route data-icon="inline-start" />{highlights.includes(lead.vessel.id) ? 'Clear track' : 'Highlight track'}</Button><Button variant="outline" size="sm" onClick={() => onSeek(closestApproach(lead.vessel, spill).atTime)}><Clock3 data-icon="inline-start" />Closest approach</Button></div>
            </> : <p className="muted-note">No vessel has enough AIS history to form a correlation lead.</p>}
            <p className="scientific-note">Correlation is an investigative lead, not proof of responsibility.</p>
          </section>

          <section className="candidate-section compact-candidates"><div className="section-heading"><h3>Other vessel tracks</h3><span className="count-label">TOP {Math.min(3, ranked.length)}</span></div>
            {visibleCandidates.filter(entry => !lead || entry.vessel.id !== lead.vessel.id).map(entry => <VesselEvidence onSeek={onSeek} key={entry.vessel.id} entry={entry} spill={spill} expanded={vesselId === entry.vessel.id} onExpand={() => onVessel(vesselId === entry.vessel.id ? null : entry.vessel.id)} trackOn={highlights.includes(entry.vessel.id)} onTrack={() => onTrack(entry.vessel.id)} flagged={!!flags[`${entry.vessel.id}__${spill.id}`] || !!entry.vessel.flagged} onFlag={() => onFlag(entry.vessel.id)} />)}
            {ranked.length > 3 && <button className="show-all" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer tracks' : `Show all ${ranked.length} tracks`}<ArrowRight size={13} /></button>}
          </section>
        </TabsContent>
        <TabsContent value="details">
          <div className="details-stack">
            <div className="sar-section"><div className="section-heading"><h3><span className="sensor-mark">+</span> SAR acquisition</h3><button className="text-control" onClick={() => setRaw(v => !v)}>{raw ? 'SHOW MASK' : 'VIEW RAW'}</button></div><SarView spill={spill} mask={!raw} lightweight={lightweight} /><div className="acquisition-meta"><span>{spill.satellite.replace(' (simulated)', '')}</span><span>{new Date(spill.detectedAt).toISOString().slice(11, 16)} UTC</span></div></div>
            <LocationDashboard spill={spill} />
            <div className="case-details"><h3>Incident assessment</h3><p>{spill.desc}</p><dl><dt>Acquisition</dt><dd>{new Date(spill.detectedAt).toUTCString()}</dd><dt>Severity</dt><dd>{spill.severity}</dd><dt>Dataset</dt><dd>Geographically grounded synthetic demonstration</dd></dl>{spill.resolvedNote && <div className="resolution-note"><Check size={16} /><p><b>Simulated case resolution</b>{spill.resolvedNote}</p></div>}</div>
            <DriftAnalysis spill={spill} />
          </div>
        </TabsContent>
      </Tabs>
    </div>

    <div className="analysis-footer compact-footer"><Button onClick={() => setExportOpen(true)} className="w-full"><ArrowDownToLine data-icon="inline-start" />Export investigation<ArrowRight data-icon="inline-end" /></Button><span>HTML · JSON · CSV · GEOJSON</span></div>
    <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} spill={spill} ranked={ranked} flaggedIds={vessels.filter(v => flags[`${v.id}__${spill.id}`]).map(v => v.id)} context={{ referenceTime, replayTime }} />
  </aside>
}
