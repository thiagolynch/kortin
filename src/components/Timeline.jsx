import { useEffect, useMemo, useRef, useState } from 'react';
import { clamp, formatTime, MIN_CLIP } from '../lib/timeline';

const PAD = 16; // margem esquerda da trilha (px)
const DRAG_TYPE = 'application/x-kortin-clip';

function tickStep(zoom) {
  // escolhe o espaçamento das marcações para ficarem a ~80px
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s * zoom >= 80) || 600;
}

export default function Timeline({
  segments, total, time, zoom, setZoom, playing, selectedId,
  onSeek, onSelect, onTrimStart, onTrim, onReorder,
}) {
  const scrollRef = useRef(null);
  const innerRef = useRef(null);
  const trimming = useRef(false);
  const [dropHint, setDropHint] = useState(null); // { index, x }

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

  // Arrastar no ruler/trilha para navegar
  const startScrub = (e) => {
    if (e.button !== 0) return;
    onSeek(timeFromEvent(e));
    const move = (ev) => onSeek(timeFromEvent(ev));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Alças de corte
  const startTrim = (e, seg, side) => {
    e.stopPropagation();
    e.preventDefault();
    trimming.current = true;
    onSelect(seg.clip.id);
    onTrimStart();
    const x0 = e.clientX;
    const { inPoint, outPoint, duration, id } = seg.clip;
    const move = (ev) => {
      const delta = (ev.clientX - x0) / zoom;
      if (side === 'in') {
        onTrim(id, { inPoint: clamp(inPoint + delta, 0, outPoint - MIN_CLIP) });
      } else {
        onTrim(id, { outPoint: clamp(outPoint + delta, inPoint + MIN_CLIP, duration) });
      }
    };
    const up = () => {
      trimming.current = false;
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

  // Acompanha o cursor durante o play
  useEffect(() => {
    const el = scrollRef.current;
    if (!playing || !el) return;
    const x = PAD + time * zoom;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) {
      el.scrollLeft = x - 60;
    }
  }, [time, playing, zoom]);

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
            const selected = seg.clip.id === selectedId;
            const w = Math.max(seg.len * zoom, 6);
            return (
              <div
                key={seg.clip.id}
                className={`tl-clip${selected ? ' selected' : ''}`}
                style={{
                  left: PAD + seg.start * zoom,
                  width: w,
                  backgroundImage: seg.clip.thumb ? `url(${seg.clip.thumb})` : undefined,
                }}
                draggable
                onDragStart={(e) => onDragStart(e, i)}
                onDragEnd={() => setDropHint(null)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  onSelect(seg.clip.id);
                  onSeek(timeFromEvent(e));
                }}
                title={`${seg.clip.name} · ${formatTime(seg.len)}`}
              >
                <div className="tl-clip-label">
                  <span>{seg.clip.name}</span>
                  <em>{formatTime(seg.len)}</em>
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

        <div className="tl-playhead" style={{ left: PAD + time * zoom }}>
          <div className="tl-playhead-cap" />
        </div>
      </div>
    </div>
  );
}
