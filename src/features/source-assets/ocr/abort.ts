export function createAbortError() {
  return new DOMException("The OCR operation was aborted.", "AbortError");
}

/** Race a long browser operation against AbortSignal and consume late results. */
export function raceWithAbort<T>(
  operation: PromiseLike<T>,
  signal?: AbortSignal,
  onAbort?: () => void | Promise<void>,
) {
  const promise = Promise.resolve(operation);
  if (!signal) return promise;

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanUp = () => signal.removeEventListener("abort", abort);
    const rejectAborted = () => {
      if (settled) return;
      settled = true;
      cleanUp();
      void promise.catch(() => undefined);
      try {
        void Promise.resolve(onAbort?.()).catch(() => undefined);
      } finally {
        reject(createAbortError());
      }
    };
    function abort() {
      rejectAborted();
    }

    if (signal.aborted) {
      rejectAborted();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanUp();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanUp();
        reject(error);
      },
    );
  });
}
