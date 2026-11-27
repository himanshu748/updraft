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

export async function fetchDay(): Promise<DayRsp> {
  const request = new AbortController()
  const timeout = setTimeout(() => request.abort(), 4000)
  try {
    return await call<DayRsp>(Endpoint.Day, undefined, request.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export const postRun = (req: RunReq): Promise<RunRsp> =>
  call<RunRsp>(Endpoint.Run, req)
export const postShare = (req: ShareReq): Promise<ShareRsp> =>
  call<ShareRsp>(Endpoint.Share, req)
