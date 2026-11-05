/**
 * Model shelf.
 *
 * Reads the live routable catalog, stores bookmarks in the domain store,
 * and applies a chosen model as the default or to one existing session.
 * The page and the agent tool call the same methods.
 *
 * @module @local/model-shelf
 */

const NS = 'model-shelf'
const ROOT = '/model-shelf'
const MAX_BODY = 32_000
const SESSION_LIMIT = 8
const CANDIDATE_LIMIT = 12
const DOMAIN = 'model_shelf'
const TABLE = 'bookmarks'

const bookmarkSchema = {
  /**
   * @param {unknown} raw
   */
  parse(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('bookmark must be an object')
    const provider = clean(raw.provider, 120)
    const model = clean(raw.model, 200)
    if (!provider || !model) throw new Error('bookmark needs a provider and a model')
    const pinnedAt = Number(raw.pinnedAt)
    return {
      provider,
      model,
      name: clean(raw.name, 200) || model,
      providerName: clean(raw.providerName, 120) || provider,
      pinnedAt: Number.isFinite(pinnedAt) ? pinnedAt : Date.now(),
    }
  },
}

const spec = {
  name: DOMAIN,
  version: 1,
  tables: {
    [TABLE]: { valueSchema: bookmarkSchema },
  },
}

export const name = NS
export const inject = ['sessionController']

/**
 * Why this plugin could not mount, if it could not. A plugin whose apply
 * throws makes the desktop shell refuse to boot the whole profile, so every
 * mount step below is contained and reported instead of propagated.
 * @type {string}
 */
let mountError = ''

/**
 * @param {unknown} value
 * @param {number} max
 */
function clean(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

/**
 * @param {string} provider
 * @param {string} model
 */
function bookmarkKey(provider, model) {
  return `${encodeURIComponent(provider)}__${encodeURIComponent(model)}`
}

/**
 * Bookmarked models lead their API group. Groups that contain a bookmark
 * lead the other groups. The chat picker still pins its own DeepSeek groups.
 * @param {Record<string, any>} catalog
 * @param {readonly { provider?: string, model?: string }[]} bookmarks
 */
function prioritizeCatalog(catalog, bookmarks) {
  if (!catalog || !Array.isArray(catalog.groups) || !bookmarks?.length) return catalog
  const saved = new Set(bookmarks.map(item => `${item.provider}\n${item.model}`))
  const ranked = catalog.groups.map(group => {
    const models = Array.isArray(group?.models) ? group.models : []
    const first = []
    const rest = []
    for (const model of models) {
      if (saved.has(`${group.id}\n${model.id}`)) first.push(model)
      else rest.push(model)
    }
    return {
      saved: first.length > 0,
      group: first.length ? { ...group, models: [...first, ...rest] } : group,
    }
  })
  return {
    ...catalog,
    groups: [
      ...ranked.filter(item => item.saved).map(item => item.group),
      ...ranked.filter(item => !item.saved).map(item => item.group),
    ],
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 */
function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (raw.trim() === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('request body is not JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function sameOrigin(req, res) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    if (new URL(origin).host !== req.headers.host) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request denied' })
      return false
    }
  } catch {
    sendJson(res, 403, { ok: false, error: 'invalid origin' })
    return false
  }
  return true
}

/**
 * @param {unknown} error
 */
function reason(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message) return error.message
  return 'the operation failed'
}

/**
 * Mount the shelf. Never throw: a mount failure degrades this plugin only.
 * @param {import('@cordisjs/core').Context} ctx
 */
export function apply(ctx) {
  try {
    mount(ctx)
  } catch (error) {
    mountError = reason(error)
    try {
      ctx.logger?.warn?.('model-shelf: mount failed: %s', mountError)
    } catch {
      // Logging must not turn a contained failure into a boot failure.
    }
  }
}

/**
 * @param {import('@cordisjs/core').Context} ctx
 */
function mount(ctx) {
  const controller = ctx.sessionController

  /** @type {Promise<{ domain?: { table: (name: string) => any, close: () => Promise<void> }, owned: boolean, error?: string }>} */
  let storageReady = Promise.resolve({ owned: false, error: 'bookmark storage is not mounted' })

  ctx.inject(['storageDomain'], (child) => {
    try {
      storageReady = openShelf(child)
      child.effect(() => () => {
        storageReady.then(opened => {
          if (opened.owned) return opened.domain?.close()
        }).catch(() => undefined)
      }, 'model-shelf: storage')
    } catch (error) {
      mountError = mountError || reason(error)
      storageReady = Promise.resolve({ owned: false, error: mountError })
    }
  })

  /**
   * @param {import('@cordisjs/core').Context} child
   */
  async function openShelf(child) {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        return { domain: await child.storageDomain.open(spec), owned: true }
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'already-open') {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
        return { owned: false, error: reason(error) }
      }
    }
    return { owned: false, error: 'bookmark storage is still closing' }
  }

  async function table() {
    const opened = await storageReady
    if (!opened.domain) {
      return { error: opened.error || 'bookmark storage is not ready' }
    }
    return { table: opened.domain.table(TABLE) }
  }

  function listBookmarks(store) {
    return [...store.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.pinnedAt - a.pinnedAt)
  }

  async function orderedCatalog() {
    const value = await controller.modelCatalog()
    try {
      const stored = await table()
      if (!stored.table) return value
      return prioritizeCatalog(value, listBookmarks(stored.table))
    } catch {
      return value
    }
  }

  async function catalog() {
    const value = await orderedCatalog()
    const groups = Array.isArray(value?.groups) ? value.groups : []
    return {
      default: publicSelection(value?.default),
      groups: groups.map(group => ({
        id: clean(group?.id, 120),
        name: clean(group?.name, 120) || clean(group?.id, 120),
        models: (Array.isArray(group?.models) ? group.models : []).map(model => ({
          id: clean(model?.id, 200),
          name: clean(model?.name, 200) || clean(model?.id, 200),
          description: clean(model?.description, 400),
          reasoning: publicReasoning(model?.reasoning),
        })).filter(model => model.id),
      })).filter(group => group.id),
      failures: (Array.isArray(value?.failures) ? value.failures : []).map(item => ({
        id: clean(item?.id, 120),
        name: clean(item?.name, 120) || clean(item?.id, 120),
        message: clean(item?.message, 300),
      })),
    }
  }

  async function sessions() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const listed = await ctx.sessionController.list({}, controller.signal)
      const items = Array.isArray(listed?.items) ? listed.items : []
      return items
        .filter(item => item && item.blank !== true && item.sessionId)
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, SESSION_LIMIT)
        .map(item => ({
          sessionId: String(item.sessionId),
          cwd: clean(item.cwd, 240),
          updatedAt: Number(item.updatedAt || 0),
          running: item.running === true,
        }))
    } catch (error) {
      return { error: reason(error) }
    } finally {
      clearTimeout(timer)
    }
  }

  async function state() {
    const [models, listed, stored] = await Promise.all([
      catalog().catch(error => ({ error: reason(error), groups: [], failures: [], default: null })),
      sessions(),
      table(),
    ])
    const current = readDefault()
    return {
      ok: !models.error,
      error: models.error,
      mountError: mountError || undefined,
      persistent: !stored.error,
      storageError: stored.error,
      default: current ?? models.default ?? null,
      groups: models.groups ?? [],
      failures: models.failures ?? [],
      bookmarks: stored.table ? listBookmarks(stored.table) : [],
      sessions: Array.isArray(listed) ? listed : [],
      sessionsError: Array.isArray(listed) ? undefined : listed.error,
    }
  }

  function readDefault() {
    const defaults = ctx.get('agentDefaultModel')
    if (!defaults) return null
    try {
      return publicSelection(defaults.currentSelection())
    } catch (error) {
      return { error: reason(error) }
    }
  }

  /**
   * @param {Record<string, unknown>} request
   */
  function matches(request) {
    const provider = clean(request.provider, 120).toLowerCase()
    const model = clean(request.model, 200).toLowerCase()
    const query = clean(request.query, 200).toLowerCase()
    return (group, item) => {
      if (provider && group.id.toLowerCase() !== provider && group.name.toLowerCase() !== provider) return false
      if (model && item.id.toLowerCase() !== model && item.name.toLowerCase() !== model) return false
      if (!query) return Boolean(provider || model)
      const haystack = `${group.id} ${group.name} ${item.id} ${item.name} ${item.description || ''}`.toLowerCase()
      return haystack.includes(query)
    }
  }

  /**
   * @param {Awaited<ReturnType<typeof catalog>>} models
   * @param {Record<string, unknown>} request
   */
  function find(models, request) {
    const test = matches(request)
    /** @type {Array<Record<string, unknown>>} */
    const hits = []
    for (const group of models.groups ?? []) {
      for (const item of group.models) {
        if (!test(group, item)) continue
        hits.push({
          provider: group.id,
          providerName: group.name,
          model: item.id,
          name: item.name,
          description: item.description || undefined,
          reasoning: item.reasoning,
        })
        if (hits.length >= CANDIDATE_LIMIT + 1) return hits
      }
    }
    return hits
  }

  /**
   * @param {Record<string, unknown>} request
   * @param {boolean} bookmarked
   */
  async function setBookmark(request, bookmarked) {
    const stored = await table()
    if (!stored.table) return { ok: false, error: stored.error }
    if (!bookmarked) {
      const provider = clean(request.provider, 120)
      const model = clean(request.model, 200)
      if (provider && model) {
        await stored.table.delete(bookmarkKey(provider, model))
        return { ok: true, bookmarked: false, bookmarks: listBookmarks(stored.table) }
      }
    }
    let models
    try {
      models = await catalog()
    } catch (error) {
      return { ok: false, error: reason(error) }
    }
    const hits = find(models, request)
    if (hits.length !== 1) {
      return {
        ok: false,
        error: hits.length === 0 ? 'no catalog model matched' : 'more than one model matched',
        matches: hits.slice(0, CANDIDATE_LIMIT).map(publicHit),
      }
    }
    const hit = hits[0]
    const key = bookmarkKey(String(hit.provider), String(hit.model))
    if (!bookmarked) {
      await stored.table.delete(key)
      return { ok: true, bookmarked: false, model: publicHit(hit), bookmarks: listBookmarks(stored.table) }
    }
    const record = bookmarkSchema.parse({
      provider: hit.provider,
      model: hit.model,
      name: hit.name,
      providerName: hit.providerName,
      pinnedAt: Date.now(),
    })
    await stored.table.put(key, record)
    return { ok: true, bookmarked: true, model: publicHit(hit), bookmarks: listBookmarks(stored.table) }
  }

  /**
   * @param {Record<string, unknown>} request
   */
  async function useModel(request) {
    let models
    try {
      models = await catalog()
    } catch (error) {
      return { ok: false, error: reason(error) }
    }
    const hits = find(models, request)
    if (hits.length !== 1) {
      return {
        ok: false,
        error: hits.length === 0 ? 'no catalog model matched' : 'more than one model matched',
        matches: hits.slice(0, CANDIDATE_LIMIT).map(publicHit),
      }
    }
    const hit = hits[0]
    const effort = clean(request.reasoningEffort, 80)
    const allowed = hit.reasoning?.efforts?.map(item => item.id) ?? []
    if (effort && allowed.length > 0 && !allowed.includes(effort)) {
      return { ok: false, error: 'that reasoning effort is not advertised by this model', model: publicHit(hit) }
    }
    const selection = {
      provider: String(hit.provider),
      model: String(hit.model),
      ...(effort ? { reasoningEffort: effort } : {}),
    }
    const asDefault = request.asDefault !== false
    const sessionId = clean(request.sessionId, 120)
    if (!asDefault && !sessionId) {
      return { ok: false, error: 'choose a session or save the default', model: publicHit(hit) }
    }
    /** @type {Record<string, unknown>} */
    const result = { ok: true, model: publicHit(hit), selected: selection }
    if (asDefault) {
      const defaults = ctx.get('agentDefaultModel')
      if (!defaults) {
        result.ok = false
        result.defaultSaved = false
        result.error = 'the default model service is not mounted'
      } else {
        await defaults.saveSelection(selection)
        result.defaultSaved = true
      }
    }
    if (sessionId) {
      try {
        const applied = await ctx.sessionController.selectModel({ sessionId, ...selection })
        result.sessionApplied = true
        result.session = applied?.selected ?? selection
      } catch (error) {
        result.ok = false
        result.sessionApplied = false
        result.error = reason(error)
      }
    }
    return result
  }

  /**
   * @param {Record<string, unknown>} request
   */
  async function run(request) {
    const action = clean(request.action, 40)
    if (action === 'state' || action === 'catalog') {
      const snapshot = await state()
      if (action === 'catalog') {
        const query = clean(request.query, 200)
        const provider = clean(request.provider, 120)
        if (!query && !provider) {
          return {
            ok: snapshot.ok,
            error: snapshot.error,
            default: snapshot.default,
            failures: snapshot.failures,
            bookmarks: snapshot.bookmarks,
            providers: (snapshot.groups ?? []).map(group => ({
              id: group.id,
              name: group.name,
              count: group.models.length,
            })),
          }
        }
        return {
          ok: snapshot.ok,
          error: snapshot.error,
          matches: find(snapshot, request).slice(0, CANDIDATE_LIMIT).map(publicHit),
        }
      }
      return snapshot
    }
    if (action === 'bookmarks') {
      const stored = await table()
      if (!stored.table) return { ok: false, error: stored.error }
      return { ok: true, bookmarks: listBookmarks(stored.table) }
    }
    if (action === 'bookmark') return setBookmark(request, true)
    if (action === 'unbookmark') return setBookmark(request, false)
    if (action === 'use') return useModel(request)
    return { ok: false, error: 'action must be catalog, bookmarks, bookmark, unbookmark, or use' }
  }

  ctx.inject(['webServer'], (child) => {
    const handler = async (req, res) => {
      if (!sameOrigin(req, res)) return
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      const route = url.pathname.slice(ROOT.length)
      const method = req.method ?? 'GET'
      try {
        if (method === 'GET' && route === '/api/state') {
          sendJson(res, 200, await run({ action: 'state' }))
          return
        }
        if (method === 'GET' && route === '/api/bookmarks') {
          sendJson(res, 200, await run({ action: 'bookmarks' }))
          return
        }
        if (method === 'POST' && (route === '/api/bookmark' || route === '/api/use')) {
          const body = await readBody(req)
          const action = route === '/api/use' ? 'use' : body.bookmarked === false ? 'unbookmark' : 'bookmark'
          const result = await run({ ...body, action })
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        sendJson(res, 404, { ok: false, error: 'not found' })
      } catch (error) {
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: reason(error) })
        else res.end()
      }
    }
    try {
      child.effect(() => child.webServer.register({ kind: 'prefix', path: ROOT, handler }), 'model-shelf: http')
    } catch (error) {
      mountError = mountError || reason(error)
    }
  })

  ctx.inject(['tools'], (child) => {
    try {
      child.effect(() => child.tools.register({
      name: 'model_shelf',
      description: 'Filter the live model catalog by API, bookmark a listed model, or apply one. Models come from the catalog; do not invent model ids. bookmark and use need one exact catalog match from provider, model, or query. use saves the deployment default unless asDefault is false, and switches a session only when sessionId is set.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['catalog', 'bookmarks', 'bookmark', 'unbookmark', 'use'],
            description: 'catalog lists APIs, or matches when query/provider is set. bookmarks reads saved models. bookmark and unbookmark change one catalog model. use applies one catalog model.',
          },
          provider: {
            type: 'string',
            description: 'Catalog provider id or display name. Omit when query is enough.',
          },
          model: {
            type: 'string',
            description: 'Catalog model id or display name. Omit when query is enough.',
          },
          query: {
            type: 'string',
            description: 'Filter text matched against API name, model name, and model id.',
          },
          sessionId: {
            type: 'string',
            description: 'Existing session to switch. Omit to leave open sessions unchanged.',
          },
          reasoningEffort: {
            type: 'string',
            description: 'Effort id advertised by the matched model. Omit to keep the model default.',
          },
          asDefault: {
            type: 'boolean',
            description: 'Save the deployment default. Defaults to true for use.',
          },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args) {
        const value = await run(args && typeof args === 'object' ? args : {})
        // The registry requires lossless JSON; drop every explicit undefined.
        return JSON.parse(JSON.stringify(value))
      },
    }), 'model-shelf: tool')
    } catch (error) {
      mountError = mountError || reason(error)
    }
  })
}

/**
 * @param {unknown} selection
 */
function publicSelection(selection) {
  if (!selection || typeof selection !== 'object') return null
  const provider = clean(selection.provider, 120)
  const model = clean(selection.model, 200)
  if (!provider || !model) return null
  const reasoningEffort = clean(selection.reasoningEffort, 80)
  return reasoningEffort ? { provider, model, reasoningEffort } : { provider, model }
}

/**
 * @param {unknown} reasoning
 */
function publicReasoning(reasoning) {
  if (!reasoning || typeof reasoning !== 'object') return undefined
  const efforts = (Array.isArray(reasoning.efforts) ? reasoning.efforts : []).map(item => ({
    id: clean(item?.id, 80),
    name: clean(item?.name, 80) || clean(item?.id, 80),
  })).filter(item => item.id)
  if (efforts.length === 0) return undefined
  const defaultEffort = clean(reasoning.defaultEffort, 80)
  return defaultEffort ? { efforts, defaultEffort } : { efforts }
}

/**
 * @param {Record<string, unknown>} hit
 */
function publicHit(hit) {
  // Tool results must be lossless JSON: never carry an explicit undefined.
  return {
    provider: hit.provider,
    providerName: hit.providerName,
    model: hit.model,
    name: hit.name,
    ...hit.description === undefined ? {} : { description: hit.description },
    ...hit.reasoning === undefined ? {} : { reasoning: hit.reasoning },
  }
}
