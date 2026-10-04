'use client'

import { CircleAlert, Crosshair, Database, MapPin, Radio, Route, Satellite, ShieldCheck, Target, Waves, Wind, Cloud } from 'lucide-react'
import type { Spill, Vessel } from '@/lib/nauticeye/types'
import { closestApproach, rankVessels, verifiedLocation } from '@/lib/nauticeye/engine'

export function EvidenceStrip({ spill, vessel }: { spill: Spill; vessel: Vessel | null }) {
  const lead = vessel ? rankVessels(spill, [vessel])[0] : null
  const ca = vessel ? closestApproach(vessel, spill) : null
  const items = [
    { icon: Satellite, label: 'SAR', value: `${spill.confidence}% confidence`, state: spill.confidence >= 75 ? 'confirmed' : 'review' },
    { icon: Route, label: 'Correlation', value: vessel && lead ? `${lead.score.overall}% lead` : 'Select vessel', state: vessel ? 'confirmed' : 'neutral' },
    { icon: ShieldCheck, label: 'Evidence', value: 'Investigative lead', state: 'caution' },
  ] as const
  return <section className="evidence-strip" aria-label="Investigation evidence summary">
    {items.map(({ icon: Icon, label, value, state }) => <div key={label} className={`evidence-strip-card ${state}`}><span className="evidence-strip-icon"><Icon size={14} /></span><span><small>{label}</small><strong>{value}</strong></span></div>)}
  </section>
}

export function DriftAnalysis({ spill }: { spill: Spill }) {
  const bearing = Math.round((spill.lat * 7 + spill.lng * 11) % 360)
  return <section className="drift-card" aria-label="Illustrative environmental drift analysis">
    <div className="section-heading"><h3><Waves size={13} /> Drift analysis</h3><span className="count-label">ILLUSTRATIVE</span></div>
    <div className="drift-grid">
      <div><Wind size={13} /><b>18 kn</b><small>Wind speed</small></div>
      <div><Waves size={13} /><b>1.4 kn</b><small>Surface current</small></div>
      <div><Cloud size={13} /><b>1.8 m</b><small>Wave height</small></div>
    </div>
    <div className="drift-vector"><span>Projected movement</span><i style={{ transform: `rotate(${bearing}deg)` }} /><b>{bearing}°</b></div>
    <p>Environmental inputs are placeholders in this demonstration.</p>
  </section>
}

export function LocationDashboard({ spill }: { spill: Spill }) {
  const verified = verifiedLocation(spill)
  const tier = verified.distM <= 300 ? 'good' : verified.distM <= 650 ? 'warn' : 'bad'
  const tierLabel = tier === 'good' ? 'HIGH AGREEMENT' : tier === 'warn' ? 'MODERATE OFFSET' : 'REVIEW OFFSET'
  return <section className="location-card" aria-label="Detected vs verified spill location">
    <div className="section-heading"><h3><Crosshair size={13} /> Location accuracy</h3><span className="count-label">ILLUSTRATIVE</span></div>
    <div className="location-grid">
      <div className="location-point">
        <span className="location-dot detected"><MapPin size={11} /></span>
        <small>AI-DETECTED (SAR)</small>
        <b>{spill.lat.toFixed(4)}° N</b>
        <b>{spill.lng.toFixed(4)}° E</b>
      </div>
      <div className="location-point">
        <span className="location-dot actual"><Target size={11} /></span>
        <small>VERIFIED REFERENCE</small>
        <b>{verified.lat.toFixed(4)}° N</b>
        <b>{verified.lng.toFixed(4)}° E</b>
      </div>
    </div>
    <div className="location-offset">
      <i style={{ transform: `rotate(${verified.bearing}deg)` }} />
      <div><b>{verified.distM}<small> m</small></b><span>Positional offset</span></div>
      <em className={`offset-badge ${tier}`}>{tierLabel}</em>
    </div>
    <p>Verified reference point is a simulated cross-check for this demonstration; no secondary sensor is connected.</p>
  </section>
}

export function SystemHealth() {
  const services = [['SAR SERVICE', Satellite], ['AIS SERVICE', Radio], ['CORRELATION', Route], ['MAP ENGINE', Database]] as const
  return <div className="system-health" aria-label="System status">{services.map(([label, Icon]) => <span key={label}><i><Icon size={9} /></i>{label}<b>ONLINE</b></span>)}<span className="simulated"><CircleAlert size={9} />DATA PIPELINE <b>SIMULATION</b></span></div>
}

export function InvestigationStatus({ spill, vessel }: { spill: Spill; vessel: Vessel | null }) {
  const steps = ['DETECTED', 'ANALYZING', 'CORRELATED', spill.status === 'resolved' ? 'RESOLVED' : 'LEAD']
  const active = spill.status === 'resolved' ? 3 : vessel ? 3 : 1
  const activeLabel = spill.status === 'resolved' ? 'RESOLVED' : vessel ? 'INVESTIGATION ACTIVE' : 'ANALYZING'
  return <div className="investigation-status" aria-label="Investigation status">
    <div className="status-head"><span className="eyebrow">CASE PROGRESSION</span><b>{activeLabel}</b></div>
    <div className="status-track compact">{steps.map((step, i) => <span key={step} className={i <= active ? 'done' : ''}><i>{i < active ? '✓' : String(i + 1).padStart(2, '0')}</i><small>{step}</small>{i < steps.length - 1 && <em />}</span>)}</div>
  </div>
}

export function ReplayBanner({ step }: { step: number }) {
  const stages = ['AIS HISTORY', 'VESSEL SINKS', 'SAR ACQUISITION', 'SEGMENTATION', 'DRIFT RECONSTRUCTION', 'AIS CORRELATION', 'INVESTIGATION LEAD']
  const checkpoints = [0, 10, 20, 28, 38, 48, 56]
  let index = 0
  checkpoints.forEach((point, i) => { if (step >= point) index = i })
  return <div className="replay-banner" role="status"><span className="replay-live"><i />REPLAY</span><div>{stages.map((stage, i) => <span key={stage} className={i === index ? 'current' : i < index ? 'done' : ''}><b>{String(i + 1).padStart(2, '0')}</b>{stage}{i < stages.length - 1 && <em />}</span>)}</div></div>
}
