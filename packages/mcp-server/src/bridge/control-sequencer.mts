/** Serialize UI/input transitions; emergency stops invalidate queued and active work. */
export function createControlSequencer() {
  let tail = Promise.resolve(), epoch = 0, controller = new AbortController();
  const interrupt = () => { epoch++; controller.abort(); controller = new AbortController(); };
  return {
    interrupt,
    current: () => epoch,
    isCurrent: (value: number) => epoch === value,
    run<T>(caller: AbortSignal, operation: (signal: AbortSignal) => Promise<T>, urgent = false): Promise<T> {
      if (urgent) interrupt();
      const accepted = epoch;
      const signal = AbortSignal.any([caller, controller.signal]);
      const perform = () => {
        if (accepted !== epoch || signal.aborted) return Promise.reject<T>(Error('CANCELLED'));
        return operation(signal);
      };
      const prior = tail;
      const result = urgent ? perform() : prior.then(perform);
      // Urgent stop runs immediately, but newly admitted work must still wait
      // for its management transition and interrupted predecessor cleanup.
      tail = urgent ? Promise.allSettled([prior, result]).then(() => {}) : result.then(() => {}, () => {});
      return result;
    }
  };
}
