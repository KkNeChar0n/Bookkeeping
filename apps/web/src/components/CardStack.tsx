import { useNavigate } from 'react-router-dom';
import { useCards } from '../api/hooks';
import { CARD_TYPE_LABEL, type CardType } from '../api/types';

/** 某类型卡片叠放列表，点击进入 `${basePath}/${cardId}` */
export function CardStack({ type, basePath }: { type: CardType; basePath: string }) {
  const cards = useCards();
  const navigate = useNavigate();
  const list = (cards.data ?? []).filter((c) => c.type === type);

  if (!list.length) {
    return <div className="card muted">还没有{CARD_TYPE_LABEL[type]}。</div>;
  }
  return (
    <div className="stack">
      {list.map((c) => (
        <div key={c.id} className="stack-item" onClick={() => navigate(`${basePath}/${c.id}`)}>
          <div className="stack-head">
            <div className="stack-name">
              <span>{c.name}</span>
              <span className="type-tag">{CARD_TYPE_LABEL[type]}</span>
            </div>
            <span style={{ color: 'var(--primary)' }}>›</span>
          </div>
        </div>
      ))}
    </div>
  );
}
