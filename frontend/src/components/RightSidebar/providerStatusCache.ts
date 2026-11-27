import { transport, type ProvidersStatusResponse } from '../../transport/client';

let cachedResponse: ProvidersStatusResponse | null = null;
let cachedAt = 0;
let inFlightPromise: Promise<ProvidersStatusResponse> | null = null;
const CACHE_TTL_MS = 10_000;

type Listener = (data: ProvidersStatusResponse) => void;
const listeners = new Set<Listener>();

export function subscribeProvidersStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

export async function getSharedProvidersStatus(
  forceRefresh = false,
  signal?: AbortSignal
): Promise<ProvidersStatusResponse> {
  if (!forceRefresh && cachedResponse && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResponse;
  }

  if (!forceRefresh && inFlightPromise) {
    return awaitWithSignal(inFlightPromise, signal);
  }

  const req = transport
    .getProvidersStatus(forceRefresh ? signal : undefined)
    .then((data) => {
      cachedResponse = data;
      cachedAt = Date.now();
      for (const listener of listeners) {
        listener(data);
      }
      return data;
    })
    .finally(() => {
      if (inFlightPromise === req) {
        inFlightPromise = null;
      }
    });

  if (!forceRefresh) {
    inFlightPromise = req;
    return awaitWithSignal(req, signal);
  }

  return req;
}
