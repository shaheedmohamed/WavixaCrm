/**
 * App-lifecycle pub/sub — screens subscribe to `foreground` instead of
 * wiring their own AppState listeners (one listener at the app root fans
 * out to every subscriber).
 */
type Fn = () => void;
const listeners = new Set<Fn>();

export const appEvents = {
  onForeground(fn: Fn): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emitForeground() {
    listeners.forEach((fn) => {
      try { fn(); } catch {}
    });
  },
};
