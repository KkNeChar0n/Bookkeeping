import { useRef, useState } from 'react';

/**
 * 横向滑动切换（整卡滑出→新卡滑入）。
 * onCommit(dir): dir=1 表示"下一个"(左滑), dir=-1 表示"上一个"(右滑)。
 * 返回 drag/instant 用于 transform，handlers 挂在滑动容器上；
 * onClickCapture 用于区分滑动与点击（滑动后吞掉 click，避免误触发导航）。
 */
export function useCardSlide(onCommit: (dir: 1 | -1) => void) {
  const [drag, setDrag] = useState(0);
  const [instant, setInstant] = useState(false);
  const animating = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const width = () => Math.max(typeof window !== 'undefined' ? window.innerWidth : 400, 360);

  const run = (dir: 1 | -1) => {
    if (animating.current) return;
    animating.current = true;
    const out = dir === 1 ? -width() : width();
    setInstant(false);
    setDrag(out); // 滑出
    window.setTimeout(() => {
      onCommit(dir);
      setInstant(true);
      setDrag(-out); // 瞬移到另一侧
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setInstant(false);
          setDrag(0); // 滑入
          window.setTimeout(() => {
            animating.current = false;
          }, 320);
        }),
      );
    }, 300);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (animating.current) return;
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
    setInstant(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (Math.abs(mx) > Math.abs(my)) setDrag(Math.max(-160, Math.min(160, mx)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    start.current = null;
    if (Math.abs(mx) >= Math.abs(my) && Math.abs(mx) > 45) {
      swiped.current = true;
      run(mx < 0 ? 1 : -1);
    } else {
      setInstant(false);
      setDrag(0);
    }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (swiped.current) {
      e.stopPropagation();
      swiped.current = false;
    }
  };

  return {
    drag,
    instant,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
    onClickCapture,
  };
}
