import { EventSourceMessage, EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source';

export async function apiRequest(url: string, options: any) {
  if (!url) throw new Error("Request URL is required");

  const mergeOptions = {
    headers: {
      "Content-Type": "application/json",
    },
    ...options
  };

  try {
    const response = await fetch(url, { ...mergeOptions });

    if (!response.ok) {
      throw new Error("Failed to fetch data from API");
    }

    const json = await response.json();
    return json;
  } catch (error) {
    console.error(error);
  }
}
class RetriableError extends Error { }
class FatalError extends Error { }

export interface SSECallbacks<T> {
  onmessage: (msg: T) => void
  onclose?: () => void
  onerror?: (err: Error) => void
}

export interface ChatMessage {
  token?: string
  errmsg?: string
  sessionId: string
  histories: any
}

export function fetchSSE<T>(sseUrl: string, options: any, callbacks: SSECallbacks<T>) {
  const ctrl = new AbortController();
  fetchEventSource(sseUrl, {
    async onopen(response) {
      if (response.ok && response.headers.get('content-type') === EventStreamContentType) {
        return;
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new FatalError();
      } else {
        throw new RetriableError();
      }
    },
    onmessage(msg: EventSourceMessage) {
      
      const { event, id, data, retry } = msg;
      if (event === 'FatalError') {
        throw new FatalError(data);
      } else if (event === 'finish') {
        ctrl.abort();
      }
      const _msg = JSON.parse(data) as T;
      callbacks.onmessage(_msg)
    },
    onerror(err) {
      if (err instanceof FatalError) {
        throw err;
      } else {
        callbacks.onerror && callbacks.onerror(err)
      }
      return 10000;
    },
    onclose: callbacks.onclose,
    openWhenHidden: true,
    headers: {
      "Content-Type": "application/json",
    },
    signal: ctrl.signal,
    ...options
  })
}