import {
  type DayRsp,
  Endpoint,
  type ErrorRsp,
  type RunReq,
  type RunRsp,
  type ShareReq,
  type ShareRsp,
} from '../shared/api.ts'

async function call<T>(
  endpoint: Endpoint,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const rsp = await fetch(`/${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  const json = (await rsp.json()) as T | ErrorRsp
  if (!rsp.ok) throw Error((json as ErrorRsp).error ?? `HTTP ${rsp.status}`)
  return json as T
}

async function callWithTimeout<T>(
  endpoint: Endpoint,
  timeoutMs: number,
  body?: unknown,
): Promise<T> {
  const request = new AbortController()
  const timeout = setTimeout(() => request.abort(), timeoutMs)
  try {
    return await call<T>(endpoint, body, request.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchDay = (): Promise<DayRsp> =>
  callWithTimeout<DayRsp>(Endpoint.Day, 4000)

// A timeout cannot tell us whether the server saved the run, so never retry it here.
export const postRun = (req: RunReq): Promise<RunRsp> =>
  callWithTimeout<RunRsp>(Endpoint.Run, 8000, req)
export const postShare = (req: ShareReq): Promise<ShareRsp> =>
  call<ShareRsp>(Endpoint.Share, req)
