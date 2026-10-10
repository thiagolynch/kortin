import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { clamp, formatSpeed, formatTime, MIN_CLIP, snapPoints, snapTime, sourceTime } from '../lib/timeline';
import { selectPlaying, selectTime, usePlayhead } from '../state/playhead';

const PAD = 16; // margem esquerda da trilha (px)
const DRAG_TYPE = 'application/x-kortin-clip';
const PEAKS_PER_SECOND = 50;

function tickStep(zoom) {
  // escolhe o espaçamento das marcações para ficarem a ~80px
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s * zoom >= 80) || 600;
}

const bucketOf = (w) => Math.ceil(Math.log2(Math.max(2, w / 2)));

/** Desenha a onda sonora do trecho usado do clipe (no máximo 1 ponto a cada 2px) */
const Waveform = memo(function Waveform({ peaks, inPoint, outPoint, width, volume }) {
  const d = useMemo(() => {
    if (!peaks?.length || width < 4) return null;
    const a = Math.floor(inPoint * PEAKS_PER_SECOND);
    const b = Math.min(peaks.length, Math.ceil(outPoint * PEAKS_PER_SECOND));
    const slice = peaks.slice(a, b);
    if (!slice.length) return null;
    // colunas em potências de 2: o SVG estica, então o zoom só recalcula quando dobra
    const bucket = 2 ** bucketOf(width);
    const cols = Math.max(2, Math.min(slice.length, bucket));
    const per = slice.length / cols;
    let path = '';
    for (let i = 0; i < cols; i++) {
      let m = 0;
      for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) m = Math.max(m, slice.at(j) || 0);
      const h = Math.max(1, (m / 255) * 50 * Math.min(1, volume));
      path += `M${i} ${50 - h}V${50 + h}`;
    }
    return { path, cols };
  }, [peaks, inPoint, outPoint, bucketOf(width), volume]);
  if (!d) return null;
  return (
    <svg className="tl-wave" viewBox={`0 0 ${d.cols} 100`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d.path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

/** Único pedaço da timeline que re-renderiza a cada quadro do play */
function Playhead({ store, zoom, scrollRef }) {
  const time = usePlayhead(store, selectTime);
  const playing = usePlayhead(store, selectPlaying);
  // Acompanha o cursor durante o play
  useEffect(() => {
    const el = scrollRef.current;
    if (!playing || !el) return;
    const x = PAD + time * zoom;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = x - 60;
  }, [time, playing, zoom, scrollRef]);
  return (
    <div className="tl-playhead" style={{ transform: `translateX(${PAD + time * zoom}px)` }}>
      <div className="tl-playhead-cap" />
    </div>
  );
}

function Timeline({
  segments, total, store, zoom, setZoom, selectedId, snap, peaksByPath, cues = [],
  onSeek, onSelect, trim, onReorder,
}) {
  const scrollRef = useRef(null);
  const innerRef = useRef(null);
  const trimming = useRef(false);
  const [dropHint, setDropHint] = useState(null); // { index, x }
  const [snapLine, setSnapLine] = useState(null); // tempo onde o ímã puxou

  const width = Math.max(total * zoom + PAD * 2 + 200, 0);
  const step = tickStep(zoom);
  const ticks = useMemo(() => {
    const out = [];
    const end = total + 200 / zoom;
    for (let t = 0; t <= end; t += step) out.push(t);
    return out;
  }, [total, zoom, step]);

  const timeFromEvent = (e) => {
    const rect = innerRef.current.getBoundingClientRect();
    return clamp((e.clientX - rect.left - PAD) / zoom, 0, total);
  };

  // Arrastar no ruler/trilha para navegar (o ímã gruda nas emendas)
  const startScrub = (e) => {
    if (e.button !== 0) return;
    const points = snapPoints(segments);
    const go = (ev) => {
      const raw = timeFromEvent(ev);
      const t = snap && !ev.altKey ? snapTime(raw, points, zoom) : raw;
      setSnapLine(t !== raw ? t : null);
      onSeek(t);
    };
    go(e);
    const up = () => {
      setSnapLine(null);
      window.removeEventListener('pointermove', go);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', go);
    window.addEventListener('pointerup', up);
  };

  // Alças de corte (respeitam a velocidade; o ímã gruda no cursor e nas emendas)
  const startTrim = (e, seg, side) => {
    e.stopPropagation();
    e.preventDefault();
    trimming.current = true;
    onSelect(seg.clip.id);
    trim.start();
    const time = store.get().time; // lido uma vez: a alça gruda no cursor parado
    const x0 = e.clientX;
    const { inPoint, outPoint, duration, id } = seg.clip;
    const speed = seg.clip.speed || 1;
    const others = snapPoints(segments.filter((s) => s !== seg));
    const playheadSrc = time > seg.start && time < seg.start + seg.len ? sourceTime(seg, time) : null;
    const move = (ev) => {
      const delta = ((ev.clientX - x0) / zoom) * speed;
      const useSnap = snap && !ev.altKey;
      if (side === 'in') {
        let v = clamp(inPoint + delta, 0, outPoint - MIN_CLIP);
        if (useSnap && playheadSrc != null && Math.abs(v - playheadSrc) * (zoom / speed) < 10) v = playheadSrc;
        setSnapLine(v === playheadSrc ? time : null);
        trim.move(id, { inPoint: v });
      } else {
        let v = clamp(outPoint + delta, inPoint + MIN_CLIP, duration);
        if (useSnap) {
          // a borda direita fica em start + (out - in) / speed na linha do tempo
          const edge = seg.start + (v - inPoint) / speed;
          const target = snapTime(edge, [time, ...others], zoom);
          if (target !== edge) {
            v = clamp(inPoint + (target - seg.start) * speed, inPoint + MIN_CLIP, duration);
            setSnapLine(target);
          } else setSnapLine(null);
        }
        trim.move(id, { outPoint: v });
      }
    };
    const up = () => {
      trimming.current = false;
      setSnapLine(null);
      trim.end();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Reordenar arrastando
  const onDragStart = (e, index) => {
    if (trimming.current) return e.preventDefault();
    e.dataTransfer.setData(DRAG_TYPE, String(index));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    const t = timeFromEvent(e);
    let index = segments.length;
    for (let i = 0; i < segments.length; i++) {
      if (t < segments[i].start + segments[i].len / 2) { index = i; break; }
    }
    const x = PAD + (index < segments.length ? segments[index].start : total) * zoom;
    setDropHint({ index, x });
  };
  const onDrop = (e) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const from = Number(e.dataTransfer.getData(DRAG_TYPE));
    if (dropHint) onReorder(from, dropHint.index);
    setDropHint(null);
  };

  // Ctrl + roda do mouse = zoom
  useEffect(() => {
    const el = scrollRef.current;
    const wheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 4, 400));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [setZoom]);

  return (
    <div className="timeline" ref={scrollRef}>
      <div className="tl-inner" ref={innerRef} style={{ width }}>
        <div className="tl-ruler" onPointerDown={startScrub}>
          {ticks.map((t) => (
            <div key={t} className="tl-tick" style={{ left: PAD + t * zoom }}>
              <span>{formatTime(t, false)}</span>
            </div>
          ))}
        </div>

        <div
          className="tl-track"
          onPointerDown={(e) => { if (e.target === e.currentTarget) startScrub(e); }}
          onDragOver={onDragOver}
          onDragLeave={() => setDropHint(null)}
          onDrop={onDrop}
        >
          {!segments.length && <div className="tl-empty">A linha do tempo está vazia</div>}

          {segments.map((seg, i) => {
            const c = seg.clip;
            const selected = c.id === selectedId;
            const w = Math.max(seg.len * zoom, 6);
            const speed = c.speed || 1;
            const fiW = Math.min(c.fadeIn || 0, seg.len / 2) * zoom;
            const foW = Math.min(c.fadeOut || 0, seg.len / 2) * zoom;
            return (
              <div
                key={c.id}
                className={`tl-clip${selected ? ' selected' : ''}`}
                style={{ left: PAD + seg.start * zoom, width: w }}
                draggable
                onDragStart={(e) => onDragStart(e, i)}
                onDragEnd={() => setDropHint(null)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  onSelect(c.id);
                  onSeek(timeFromEvent(e));
                }}
                title={`${c.name} · ${formatTime(seg.len)}${speed !== 1 ? ` · ${formatSpeed(speed)}` : ''}`}
              >
                <div className="tl-clip-thumbs" style={{ backgroundImage: c.thumb ? `url(${c.thumb})` : undefined }} />
                <div className="tl-clip-audio">
                  {c.hasAudio && (c.volume ?? 1) > 0 && (
                    <Waveform
                      peaks={peaksByPath[c.path]}
                      inPoint={c.inPoint}
                      outPoint={c.outPoint}
                      width={w}
                      volume={c.volume ?? 1}
                    />
                  )}
                  {fiW > 2 && <div className="tl-fade in" style={{ width: fiW }} />}
                  {foW > 2 && <div className="tl-fade out" style={{ width: foW }} />}
                </div>
                <div className="tl-clip-label">
                  <span>{c.name}</span>
                  <em>
                    {speed !== 1 && <b className="tl-speed">{formatSpeed(speed)}</b>}
                    {formatTime(seg.len)}
                  </em>
                </div>
                {selected && (
                  <>
                    <div className="tl-handle left" onPointerDown={(e) => startTrim(e, seg, 'in')} />
                    <div className="tl-handle right" onPointerDown={(e) => startTrim(e, seg, 'out')} />
                  </>
                )}
              </div>
            );
          })}

          {dropHint && <div className="tl-drop" style={{ left: dropHint.x - 1 }} />}
        </div>

        {cues.length > 0 && (
          <div className="tl-captions" aria-label="Legendas">
            {cues.map((c) => (
              <div
                key={c.id}
                className="tl-cue"
                style={{ left: PAD + c.start * zoom, width: Math.max(2, (c.end - c.start) * zoom - 1) }}
                title={c.words.map((w) => w.text).join(' ')}
                onPointerDown={(e) => { e.stopPropagation(); onSeek(c.start + 0.01); }}
              >
                {(c.end - c.start) * zoom > 40 && <span>{c.words.map((w) => w.text).join(' ')}</span>}
              </div>
            ))}
          </div>
        )}

        {snapLine != null && <div className="tl-snapline" style={{ left: PAD + snapLine * zoom }} />}

        <Playhead store={store} zoom={zoom} scrollRef={scrollRef} />
      </div>
    </div>
  );
}

export default memo(Timeline);
