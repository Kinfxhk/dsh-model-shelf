window.__ModuleLoader__.load({
  id: '@local/model-shelf',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React
    const NS = 'model-shelf'

    const STRINGS = {
      zh: {
        nav: '模型',
        title: '模型庫',
        intro: '已連接嘅模型按 API 分開。收藏之後，對話選單會將佢哋排喺所屬 API 嘅前面。',
        search: '搜尋模型或者 API',
        refresh: '重新載入',
        loading: '載入中…',
        all: '全部',
        saved: '收藏',
        apis: 'API',
        empty: '未有符合嘅模型。',
        emptySaved: '未有收藏。喺模型卡撳星形就得。',
        failed: '載入失敗：',
        actionFailed: '操作失敗：',
        unavailable: '暫時連唔到',
        failures: '有 API 暫時攞唔到模型',
        models: '個模型',
        savedCount: '已收藏',
        default: '預設',
        makeDefault: '設為預設',
        useIn: '用喺對話',
        apply: '套用',
        cancel: '取消',
        noSession: '未有可套用嘅對話。設為預設之後，新對話會用呢個模型。',
        running: '進行中',
        appliedDefault: '已設為預設。新對話會用呢個模型。',
        appliedSession: '已套用到呢個對話。',
        appliedBoth: '已設為預設，並套用到呢個對話。',
        storage: '收藏暫時未能保存，重新開啟之後可能會冇咗。',
        bookmark: '收藏',
        unbookmark: '取消收藏',
        effort: '推理力度',
        copy: '複製 ID',
        copied: '已複製',
      },
      en: {
        nav: 'Models',
        title: 'Model shelf',
        intro: 'Connected models stay grouped by API. Bookmarked models move to the front of their API in the chat model menu.',
        search: 'Search models or APIs',
        refresh: 'Refresh',
        loading: 'Loading…',
        all: 'All',
        saved: 'Saved',
        apis: 'APIs',
        empty: 'No models match.',
        emptySaved: 'Nothing saved yet. Star a model card to keep it.',
        failed: 'Could not load: ',
        actionFailed: 'Could not complete that: ',
        unavailable: 'Unavailable',
        failures: 'Some APIs could not list models',
        models: 'models',
        savedCount: 'saved',
        default: 'Default',
        makeDefault: 'Set default',
        useIn: 'Use in chat',
        apply: 'Apply',
        cancel: 'Cancel',
        noSession: 'No open chat to switch. Setting the default still applies to new chats.',
        running: 'Running',
        appliedDefault: 'Saved as the default. New chats use this model.',
        appliedSession: 'Applied to that chat.',
        appliedBoth: 'Saved as the default and applied to that chat.',
        storage: 'Bookmarks could not be stored and may disappear after a restart.',
        bookmark: 'Bookmark',
        unbookmark: 'Remove bookmark',
        effort: 'Reasoning',
        copy: 'Copy name',
        copied: 'Copied',
      },
    }

    function Icon({ size = 16, active }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 1.9 : 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      h('path', { d: 'M5 7.5h14' }),
      h('path', { d: 'M5 12h8' }),
      h('path', { d: 'M14.2 15.2l1.15 2.3 2.55.32-1.85 1.75.46 2.53-2.31-1.22-2.31 1.22.46-2.53-1.85-1.75 2.55-.32z' }))
    }

    function Star({ filled }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        'aria-hidden': true,
      }, h('path', {
        d: 'M12 3.6l2.2 4.7 5.1.6-3.8 3.5.9 5.1L12 15.1 7.6 17.5l.9-5.1L4.7 8.9l5.1-.6z',
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
      }))
    }

    function api(pathname, body) {
      return fetch(pathname, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }).then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.error || `HTTP ${response.status}`)
          error.payload = payload
          throw error
        }
        return payload
      })
    }

    function monogram(name) {
      const text = String(name || '?').trim()
      return text.slice(0, 1).toUpperCase()
    }

    function sessionLabel(item) {
      const parts = String(item.cwd || '').split(/[\\/]/).filter(Boolean)
      const folder = parts[parts.length - 1] || ''
      const tail = String(item.sessionId || '').slice(-4)
      return folder ? `${folder} · ${tail}` : tail
    }

    function keyOf(provider, model) {
      return `${provider}\n${model}`
    }

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

    function catalogOrder(catalog) {
      return (catalog?.groups ?? []).map(group => `${group.id}:${(group.models ?? []).map(model => model.id).join(',')}`).join('|')
    }

    function cssAttr(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    function bookmarkStyle(bookmarks) {
      return bookmarks.map(item => {
        const sel = `span[data-provider-id="${cssAttr(item.provider)}"][data-model-id="${cssAttr(item.model)}"]`
        return `${sel}{color:var(--dsw-alias-brand-primary);font-weight:650;background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:0 7px;box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}`
          + `${sel}::before{content:"★";margin-right:4px;font-size:13px}`
      }).join('')
    }

    function applyPickerPriority(ctx, bookmarks) {
      const directories = ctx.get('modelDirectories')
      const store = directories?.catalog?.store
      if (!store || typeof store.getSnapshot !== 'function' || typeof store.set !== 'function') return false
      const snap = store.getSnapshot()
      if (!snap?.value?.groups) return false
      const next = prioritizeCatalog(snap.value, bookmarks)
      if (catalogOrder(snap.value) === catalogOrder(next)) return true
      store.set({ ...snap, value: next })
      return true
    }

    function Page({ t, subscribe }) {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [query, setQuery] = useState('')
      const [filter, setFilter] = useState('all')
      const [busy, setBusy] = useState('')
      const [openKey, setOpenKey] = useState('')
      const [effort, setEffort] = useState('')
      const [copied, setCopied] = useState('')
      const [, setLocaleRev] = useState(0)

      useEffect(() => subscribe ? subscribe(() => setLocaleRev(value => value + 1)) : undefined, [subscribe])

      async function load() {
        const next = await api('/model-shelf/api/state')
        setData(next)
        setError(next.error ? `${t('failed')}${next.error}` : '')
      }

      useEffect(() => {
        let stop = false
        load().catch(cause => {
          if (!stop) setError(`${t('failed')}${cause instanceof Error ? cause.message : String(cause)}`)
        })
        return () => { stop = true }
      }, [])

      const bookmarks = data?.bookmarks ?? []
      const saved = useMemo(() => {
        const map = new Map()
        for (const item of bookmarks) map.set(keyOf(item.provider, item.model), item)
        return map
      }, [bookmarks])

      const groups = data?.groups ?? []
      const needle = query.trim().toLowerCase()
      const visible = useMemo(() => {
        const source = filter === 'saved'
          ? savedGroups(groups, bookmarks)
          : groups.filter(group => filter === 'all' || group.id === filter)
        return source.map(group => ({
          ...group,
          models: group.models.filter(model => {
            if (!needle) return true
            return `${group.id} ${group.name} ${model.id} ${model.name} ${model.description || ''}`.toLowerCase().includes(needle)
          }),
        })).filter(group => group.models.length > 0)
      }, [groups, bookmarks, filter, needle])

      const total = groups.reduce((sum, group) => sum + group.models.length, 0)
      const shown = visible.reduce((sum, group) => sum + group.models.length, 0)

      async function act(path, body, busyKey, success) {
        setBusy(busyKey)
        setNotice('')
        setError('')
        try {
          const result = await api(path, body)
          if (result.bookmarks) setData(current => ({ ...(current ?? {}), bookmarks: result.bookmarks }))
          if (success) setNotice(success(result))
          if (path.endsWith('/use')) await load()
        } catch (cause) {
          setError(`${t('actionFailed')}${cause instanceof Error ? cause.message : String(cause)}`)
        } finally {
          setBusy('')
        }
      }

      function toggle(model) {
        const marked = saved.has(keyOf(model.provider, model.model))
        return act('/model-shelf/api/bookmark', {
          provider: model.provider,
          model: model.model,
          bookmarked: !marked,
        }, `save:${keyOf(model.provider, model.model)}`)
      }

      function apply(model, sessionId) {
        return act('/model-shelf/api/use', {
          provider: model.provider,
          model: model.model,
          reasoningEffort: effort || undefined,
          sessionId: sessionId || undefined,
          asDefault: true,
        }, `use:${keyOf(model.provider, model.model)}`, result => {
          setOpenKey('')
          if (result.sessionApplied && result.defaultSaved) return t('appliedBoth')
          if (result.sessionApplied) return t('appliedSession')
          return t('appliedDefault')
        })
      }

      async function copyName(model) {
        const text = model.model
        try {
          await navigator.clipboard.writeText(text)
          setCopied(keyOf(model.provider, model.model))
          setTimeout(() => setCopied(''), 1200)
        } catch {
          setError(`${t('actionFailed')}${t('copy')}`)
        }
      }

      return h('section', { className: 'ms-page' },
        h('style', null, CSS),
        h('header', { className: 'ms-head' },
          h('div', null,
            h('h1', { className: 'ms-title' }, t('title')),
            h('p', { className: 'ms-intro' }, t('intro'))),
          h('div', { className: 'ms-tools' },
            h('label', { className: 'ms-search' },
              h('span', { className: 'ms-sr' }, t('search')),
              h('input', {
                value: query,
                placeholder: t('search'),
                onChange: event => setQuery(event.target.value),
              })),
            h('button', {
              type: 'button',
              className: 'ms-btn',
              onClick: () => load().catch(cause => setError(`${t('failed')}${cause.message ?? cause}`)),
            }, t('refresh')))),
        error ? h('p', { className: 'ms-error', role: 'alert' }, error) : null,
        notice ? h('p', { className: 'ms-ok', role: 'status' }, notice) : null,
        data && data.persistent === false ? h('p', { className: 'ms-warn' }, t('storage')) : null,
        !data
          ? h('p', { className: 'ms-muted' }, t('loading'))
          : h('div', { className: 'ms-body' },
            h('nav', { className: 'ms-rail', 'aria-label': t('apis') },
              railButton(t('all'), 'all', filter, setFilter, String(total)),
              railButton(t('saved'), 'saved', filter, setFilter, String(bookmarks.length)),
              h('p', { className: 'ms-rail-label' }, t('apis')),
              groups.map(group => railButton(group.name || group.id, group.id, filter, setFilter, String(group.models.length), group.id))),
            h('div', { className: 'ms-main' },
              data.failures?.length ? h('div', { className: 'ms-failures' },
                h('strong', null, t('failures')),
                data.failures.map(item => h('p', { key: item.id || item.message }, `${item.name || item.id} · ${item.message}`))) : null,
              h('p', { className: 'ms-count' }, `${shown} ${t('models')} · ${bookmarks.length} ${t('savedCount')}`),
              visible.length === 0
                ? h('p', { className: 'ms-muted' }, filter === 'saved' && !needle ? t('emptySaved') : t('empty'))
                : visible.map(group => h('section', { key: group.id, className: 'ms-group' },
                  h('header', { className: 'ms-group-head' },
                    h('span', { className: 'ms-mark', 'aria-hidden': true }, monogram(group.name)),
                    h('div', null,
                      h('h2', null, group.name || group.id),
                      h('p', null, group.id === group.name ? `${group.models.length} ${t('models')}` : `${group.id} · ${group.models.length} ${t('models')}`))),
                  h('div', { className: 'ms-grid' }, group.models.map(model => {
                    const card = {
                      provider: model.provider || group.id,
                      providerName: model.providerName || group.name,
                      model: model.model || model.id,
                      name: model.name || model.id,
                      description: model.description,
                      reasoning: model.reasoning,
                      missing: model.missing,
                    }
                    const id = keyOf(card.provider, card.model)
                    const marked = saved.has(id)
                    const isDefault = data.default?.provider === card.provider && data.default?.model === card.model
                    const expanded = openKey === id
                    return h('article', { key: id, className: marked ? 'ms-card marked' : 'ms-card' },
                      h('div', { className: 'ms-card-top' },
                        h('span', { className: 'ms-api' }, card.providerName || card.provider),
                        h('button', {
                          type: 'button',
                          className: marked ? 'ms-star on' : 'ms-star',
                          'aria-pressed': marked,
                          'aria-label': marked ? t('unbookmark') : t('bookmark'),
                          disabled: busy === `save:${id}`,
                          onClick: () => void toggle(card),
                        }, h(Star, { filled: marked }))),
                      h('h3', null, card.name),
                      h('p', { className: 'ms-id' }, card.model),
                      card.missing ? h('p', { className: 'ms-warn' }, t('unavailable')) : null,
                      card.description ? h('p', { className: 'ms-desc' }, card.description) : null,
                      h('div', { className: 'ms-tags' },
                        isDefault ? h('span', { className: 'ms-tag brand' }, t('default')) : null,
                        card.reasoning?.efforts?.slice(0, 4).map(item => h('span', { key: item.id, className: 'ms-tag' }, item.name || item.id))),
                      h('div', { className: 'ms-actions' },
                        h('button', {
                          type: 'button',
                          className: 'ms-btn',
                          disabled: Boolean(busy) || card.missing,
                          onClick: () => void copyName(card),
                        }, copied === id ? t('copied') : t('copy')),
                        h('button', {
                          type: 'button',
                          className: 'ms-btn primary',
                          disabled: Boolean(busy) || card.missing,
                          onClick: () => void apply(card),
                        }, t('makeDefault')),
                        h('button', {
                          type: 'button',
                          className: 'ms-btn',
                          disabled: Boolean(busy) || card.missing,
                          'aria-expanded': expanded,
                          onClick: () => {
                            setOpenKey(expanded ? '' : id)
                            setEffort(card.reasoning?.defaultEffort || '')
                          },
                        }, t('useIn'))),
                      expanded ? h('div', { className: 'ms-apply' },
                        card.reasoning?.efforts?.length ? h('div', { className: 'ms-efforts' },
                          h('span', null, t('effort')),
                          card.reasoning.efforts.map(item => h('button', {
                            key: item.id,
                            type: 'button',
                            className: effort === item.id ? 'ms-chip on' : 'ms-chip',
                            onClick: () => setEffort(item.id),
                          }, item.name || item.id))) : null,
                        (data.sessions ?? []).length === 0
                          ? h('p', { className: 'ms-muted' }, t('noSession'))
                          : h('div', { className: 'ms-sessions' }, (data.sessions ?? []).map(item => h('button', {
                            key: item.sessionId,
                            type: 'button',
                            className: 'ms-session',
                            disabled: Boolean(busy),
                            onClick: () => void apply(card, item.sessionId),
                          },
                          h('span', null, sessionLabel(item)),
                          item.running ? h('em', null, t('running')) : null,
                          h('strong', null, t('apply')))))
                      ) : null)
                  })
                )))
              )
            )
          )
    }

    function railButton(label, id, filter, setFilter, count, key = id) {
      return h('button', {
        key,
        type: 'button',
        className: filter === id ? 'ms-rail-btn on' : 'ms-rail-btn',
        'aria-current': filter === id ? 'true' : undefined,
        onClick: () => setFilter(id),
      }, h('span', null, label), h('em', null, count))
    }

    function savedGroups(groups, bookmarks) {
      const known = new Map()
      for (const group of groups) {
        for (const model of group.models) known.set(keyOf(group.id, model.id), { group, model })
      }
      const byProvider = new Map()
      for (const item of bookmarks) {
        const hit = known.get(keyOf(item.provider, item.model))
        const provider = item.provider
        if (!byProvider.has(provider)) {
          byProvider.set(provider, {
            id: provider,
            name: hit?.group.name || item.providerName || provider,
            models: [],
          })
        }
        byProvider.get(provider).models.push(hit ? { ...hit.model, provider, providerName: hit.group.name } : {
          id: item.model,
          name: item.name || item.model,
          provider,
          providerName: item.providerName,
          missing: !hit,
        })
      }
      return [...byProvider.values()]
    }

    const CSS = `
      .ms-page { box-sizing: border-box; height: 100%; overflow: auto; padding: calc(var(--dsh-frame-top-clearance, 20px) + 12px) 28px 48px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 14px; line-height: 1.45; container-type: inline-size; }
      .ms-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-end; margin-bottom: 18px; }
      .ms-title { margin: 0 0 6px; font-size: 22px; font-weight: 640; letter-spacing: 0; }
      .ms-intro, .ms-muted { margin: 0; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
      .ms-tools { display: flex; gap: 8px; align-items: center; }
      .ms-search { display: block; }
      .ms-search input, .ms-btn, .ms-chip, .ms-session, .ms-rail-btn, .ms-star { font: inherit; color: var(--dsw-alias-label-primary); }
      .ms-search input { width: min(320px, 46vw); border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 999px; padding: 8px 14px; }
      .ms-search input:focus, .ms-btn:focus-visible, .ms-star:focus-visible, .ms-rail-btn:focus-visible, .ms-chip:focus-visible, .ms-session:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .ms-btn, .ms-chip, .ms-session { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
      .ms-btn:hover, .ms-chip:hover, .ms-session:hover, .ms-rail-btn:hover { background: var(--dsw-alias-bg-layer-2); }
      .ms-btn.primary { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); border-color: transparent; }
      .ms-btn:disabled, .ms-session:disabled { opacity: 0.55; cursor: default; }
      .ms-body { display: grid; grid-template-columns: 196px minmax(0, 1fr); gap: 22px; align-items: start; }
      .ms-rail { position: sticky; top: 0; display: grid; gap: 4px; }
      .ms-rail-label { margin: 14px 0 4px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
      .ms-rail-btn { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
      .ms-rail-btn.on { background: var(--dsw-alias-bg-layer-2); }
      .ms-rail-btn em, .ms-count, .ms-id, .ms-desc, .ms-api { color: var(--dsw-alias-label-secondary); }
      .ms-rail-btn em { font-style: normal; font-size: 12px; }
      .ms-main { min-width: 0; }
      .ms-count { margin: 0 0 12px; font-size: 12px; }
      .ms-failures { border: 1px solid var(--dsw-alias-state-warn-primary); background: var(--dsw-alias-bg-layer-1); border-radius: 12px; padding: 10px 12px; margin-bottom: 14px; }
      .ms-failures p, .ms-warn { color: var(--dsw-alias-state-warn-primary); }
      .ms-error { color: var(--dsw-alias-state-error-primary); }
      .ms-ok { color: var(--dsw-alias-state-success-primary); }
      .ms-group { margin: 0 0 22px; }
      .ms-group-head { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
      .ms-group-head h2 { margin: 0; font-size: 16px; font-weight: 640; }
      .ms-group-head p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .ms-mark { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary); font-weight: 680; }
      .ms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
      .ms-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 14px; padding: 12px; min-width: 0; }
      .ms-card.marked { border-color: var(--dsw-alias-brand-primary); }
      .ms-card-top, .ms-actions, .ms-tags, .ms-efforts, .ms-session { display: flex; align-items: center; gap: 6px; }
      .ms-card-top { justify-content: space-between; }
      .ms-api { font-size: 12px; }
      .ms-card h3 { margin: 8px 0 2px; font-size: 15px; font-weight: 640; overflow-wrap: anywhere; }
      .ms-id, .ms-desc { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
      .ms-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 6px; }
      .ms-tags { flex-wrap: wrap; margin-top: 8px; }
      .ms-tag { border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .ms-tag.brand { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .ms-actions { flex-wrap: wrap; margin-top: 12px; }
      .ms-star { border: 0; background: transparent; padding: 4px; border-radius: 999px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .ms-star.on { color: var(--dsw-alias-brand-primary); }
      .ms-apply { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); display: grid; gap: 8px; }
      .ms-chip.on { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); border-color: transparent; }
      .ms-sessions { display: grid; gap: 6px; }
      .ms-session { width: 100%; justify-content: space-between; border-radius: 10px; text-align: left; }
      .ms-session em { font-style: normal; color: var(--dsw-alias-state-success-primary); font-size: 11px; }
      .ms-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      @container (max-width: 720px) {
        .ms-head, .ms-body { display: block; }
        .ms-tools { margin-top: 12px; }
        .ms-search input { width: 100%; }
        .ms-rail { position: static; grid-auto-flow: column; grid-auto-columns: max-content; overflow: auto; margin-bottom: 14px; }
        .ms-rail-label { display: none; }
      }
    `

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale')
        let t = key => STRINGS.zh[key] ?? STRINGS.en[key] ?? key
        let subscribe
        try {
          if (locale) {
            ctx.effect(() => {
              try {
                return locale.register(NS, { zh: STRINGS.zh, en: STRINGS.en })
              } catch {
                const dispose = []
                for (const id of ['zh', 'en']) {
                  try { dispose.push(locale.register(NS, id, STRINGS[id])) } catch { /* local text remains */ }
                }
                return () => { for (const fn of dispose) fn() }
              }
            }, 'model-shelf: dictionaries')
            try { t = locale.bind(NS) } catch { /* local text remains */ }
            subscribe = typeof locale.subscribe === 'function' ? fn => locale.subscribe(fn) : undefined
          }
        } catch {
          // Text falls back to the built-in dictionaries.
        }
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'model-shelf',
          order: 8,
          label: () => t('nav'),
          locale: NS,
        }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'model-shelf',
          locale: NS,
        }, () => h(Page, { t, subscribe })))
        try {
          ctx.effect(() => {
            let stopped = false
            let bookmarks = []
            let dropStyles = () => {}
            const styleApi = typeof styles === 'undefined' ? null : styles
            function paint(next) {
              try {
                dropStyles()
                dropStyles = () => {}
                const css = bookmarkStyle(next)
                if (!css || !styleApi || typeof styleApi.insert !== 'function') return
                const dispose = styleApi.insert(css)
                if (typeof dispose === 'function') dropStyles = dispose
              } catch {
                // Highlighting is decorative; the picker keeps working without it.
              }
            }
            async function pull() {
              const response = await fetch('/model-shelf/api/bookmarks')
              const payload = await response.json()
              if (stopped || payload?.ok === false) return
              bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : []
              try { applyPickerPriority(ctx, bookmarks) } catch { /* ordering is best-effort */ }
              paint(bookmarks)
            }
            pull().catch(() => undefined)
            const timer = setInterval(() => { pull().catch(() => undefined) }, 2000)
            return () => {
              stopped = true
              clearInterval(timer)
              dropStyles()
            }
          }, 'model-shelf: picker priority')
        } catch {
          // A picker enhancement must never remove the sidebar entry.
        }
      },
    }
  },
})
