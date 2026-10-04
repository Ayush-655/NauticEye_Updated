'use client'

import { useEffect, useRef, useState } from 'react'
import { hashStr, prand } from '@/lib/nauticeye/engine'
import type { Spill } from '@/lib/nauticeye/types'

export function SarView({ spill, miniature = false, mask = true, lightweight = false }: { spill: Spill; miniature?: boolean; mask?: boolean; lightweight?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const phase = useRef(0)
  // Detection flash: fires once whenever the panel first shows the spill in
  // its "detected" (segmented) state -- on mount, and whenever it flips from
  // raw backscatter into the mask view.
  const [flashKey, setFlashKey] = useState(0)
  const prevMask = useRef<boolean | null>(null)
  useEffect(() => {
    if (mask && prevMask.current !== true) setFlashKey(k => k + 1)
    prevMask.current = mask
  }, [mask, spill.id])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const paint = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.clientWidth || 300, h = canvas.clientHeight || 180
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const seed = hashStr(spill.id)
      ctx.fillStyle = '#25312f'; ctx.fillRect(0, 0, w, h)
      const step = lightweight ? 4 : miniature ? 2 : 1.5
      // `phase` nudges the backscatter noise a little every redraw so the feed
      // reads as a live sensor rather than a frozen frame, without disturbing
      // the deterministic contour below.
      const t = phase.current
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const noise = prand(seed + x * 1.371 + y * 2.719 + t)
        const band = Math.sin(x * .035 + y * .055 + t * .5) * 11
        const value = 35 + noise * 76 + band
        ctx.fillStyle = `rgb(${value * .93},${value},${value * .97})`
        ctx.fillRect(x, y, step, step)
      }
      const cx = w * .52, cy = h * .5, baseR = Math.min(w, h) * .3 * (.55 + spill.confidence / 100 * .6)
      // Keep the SAR contour deterministic and visually consistent with the map footprint.
      const points = 12
      ctx.beginPath()
      for (let i = 0; i <= points; i++) {
        const index = i % points
        const a = (index / points) * Math.PI * 2
        const r = baseR * (.55 + .5 * prand(seed + index * 7.13))
        const x = cx + Math.cos(a) * r * 1.35, y = cy + Math.sin(a) * r * .82
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.fillStyle = '#111c1b'; ctx.fill()
      if (mask) { ctx.fillStyle = '#55d7b829'; ctx.fill(); ctx.strokeStyle = '#80e1c2'; ctx.lineWidth = miniature ? .7 : 1; ctx.stroke() }
      if (!miniature) {
        ctx.strokeStyle = '#c3dad322'; ctx.lineWidth = .5
        for (let x = w / 6; x < w; x += w / 6) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
        for (let y = h / 4; y < h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
        ctx.strokeStyle = '#c6e0d7'; ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6); ctx.stroke()
        ctx.strokeStyle = '#77c4aa'; ctx.setLineDash([3, 4]); ctx.strokeRect(w * .18, h * .2, w * .66, h * .61); ctx.setLineDash([])
      }
    }
    const observer = new ResizeObserver(paint)
    observer.observe(canvas); paint()
    // Drift the texture continuously instead of snapping to a new frame once a
    // second -- same "alive" feel, no visible pop. Capped frame rate keeps the
    // noisy full-canvas redraw cheap. Skipped for miniatures/lightweight/reduced motion.
    let raf = 0
    let last = 0
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!miniature && !lightweight && !reduced) {
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        if (now - last < 66) return // ~15fps ceiling, plenty smooth for this noise field
        last = now
        phase.current += 0.045
        paint()
      }
      raf = requestAnimationFrame(tick)
    }
    return () => { observer.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [spill, miniature, mask, lightweight])

  return <div className={miniature ? 'sar-view miniature' : 'sar-view'}>
    <canvas ref={ref} role="img" aria-label={`Synthetic SAR illustration of ${spill.name}${mask ? ' with illustrative segmentation contour' : ', raw texture'}`} />
    {!miniature && <>
      <span className="sar-corner top">{mask ? 'SEGMENTATION OVERLAY' : 'RAW BACKSCATTER'}</span>
      <span className="sar-corner bottom">SYNTHETIC SAR <span>{spill.confidence}% CONF.</span></span>
      <i className="sar-scan" key={`${spill.id}-${mask}`} />
      {mask && <div className="sar-detect-flash" key={flashKey} aria-hidden="true"><span className="sar-detect-badge">OIL SLICK DETECTED</span></div>}
    </>}
  </div>
}
