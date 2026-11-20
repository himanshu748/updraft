import {
  type DayRsp,
  Endpoint,
  type ErrorRsp,
  type RunReq,
  type RunRsp,
  type ShareReq,
  type ShareRsp,
} from '../shared/api.ts'

async function call<T>(endpoint: Endpoint, body?: unknown): Promise<T> {
  const rsp = await fetch(`/${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await rsp.json()) as T | ErrorRsp
  if (!rsp.ok) throw Error((json as ErrorRsp).error ?? `HTTP ${rsp.status}`)
  return json as T
}

export const fetchDay = (): Promise<DayRsp> => call<DayRsp>(Endpoint.Day)
export const postRun = (req: RunReq): Promise<RunRsp> =>
  call<RunRsp>(Endpoint.Run, req)
export const postShare = (req: ShareReq): Promise<ShareRsp> =>
  call<ShareRsp>(Endpoint.Share, req)
