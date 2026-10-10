import { baseName } from '../lib/timeline';

function formatWhen(ms) {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `hoje às ${hour}` : `${d.toLocaleDateString('pt-BR')} às ${hour}`;
}

export default function RecoveryBanner({ recovery, onRecover, onDiscard }) {
  if (!recovery) return null;
  const { data, savedAt } = recovery;
  return (
    <div className="recovery">
      <div>
        <strong>Encontramos um projeto não salvo</strong>
        <span>
          {data._path ? `"${baseName(data._path)}", ` : ''}
          {data.clips.length} clipe(s), editado {formatWhen(savedAt)}
        </span>
      </div>
      <button className="btn ghost sm" onClick={onDiscard}>Descartar</button>
      <button className="btn primary sm" onClick={onRecover}>Recuperar</button>
    </div>
  );
}
