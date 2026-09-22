import type { Store } from "../../state";
import type { Unmount } from "../context";

interface LiveRenderOptions {
  readonly store: Store;
  /**
   * Elements whose size gates the drawing. Watching the canvas rather than the
   * window also catches the moment a collapsed step is expanded: until then
   * the canvas has no size to draw on.
   */
  readonly observe: HTMLElement | readonly HTMLElement[];
  readonly render: () => void;
}

/**
 * Keeps a canvas panel in step with the store and with its own size, running
 * at most one redraw per frame however many changes arrive in between. Every
 * chart panel needs exactly this, and each used to carry its own copy.
 */
export function liveRender({ store, observe, render }: LiveRenderOptions): Unmount {
  let frameId: number | null = null;

  function schedule(): void {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(() => {
      frameId = null;
      render();
    });
  }

  render();

  const unsubscribe = store.subscribe(schedule);
  const observer = new ResizeObserver(schedule);
  for (const el of Array.isArray(observe) ? observe : [observe as HTMLElement]) {
    observer.observe(el);
  }

  return () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    observer.disconnect();
    unsubscribe();
  };
}
