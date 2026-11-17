/**
 * dsh-gallery — 设置页「图片收藏」面板(Client 半边)。
 *
 * 以 dsh.client bundle 格式加载:注册 settings.section「图片收藏」页与输入框选图器。
 * 数据走 /dsh-gallery-api;语义见 INTERFACE.md §7 / §8。
 * 注册 id 必须等于 loader entry 名(dsh-gallery)。
 */
window.__ModuleLoader__.load({
  id: 'dsh-gallery',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const CSS = [
      '.gallery-panel{display:flex;flex-direction:column;gap:14px;padding:4px 0;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.gallery-panel .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.gallery-panel .section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.04em;margin:2px 0 -4px}',
      '.gallery-panel .switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l1);cursor:pointer;transition:background .15s ease;flex:none;display:inline-block}',
      '.gallery-panel .switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s ease}',
      '.gallery-panel .switch.on{background:var(--dsw-alias-brand-primary)}',
      '.gallery-panel .switch.on::after{transform:translateX(16px)}',
      '.gallery-panel input[type=text],.gallery-panel select,.gallery-panel textarea{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;font-size:13px;outline:none;transition:border-color .12s ease}',
      '.gallery-panel input[type=text]:focus,.gallery-panel select:focus,.gallery-panel textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.gallery-panel textarea{resize:vertical;font-family:inherit}',
      '.gallery-panel button{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 12px;font-size:13px;cursor:pointer;transition:border-color .12s ease,background .12s ease}',
      '.gallery-panel button:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.gallery-panel button:disabled{opacity:.5;cursor:default}',
      '.gallery-panel .btn-primary{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.gallery-panel .btn-primary:hover{background:var(--dsw-alias-button-primary-hover);border-color:var(--dsw-alias-button-primary-hover)}',
      '.gallery-panel .notice{padding:7px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.gallery-panel .empty{color:var(--dsw-alias-label-secondary);padding:24px;text-align:center}',
      '.gallery-panel .gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}',
      '.gallery-panel .gallery-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:transform .12s ease,box-shadow .12s ease}',
      '.gallery-panel .gallery-card:hover{transform:translateY(-2px);box-shadow:0 5px 14px rgba(0,0,0,.12)}',
      '.gallery-panel .gallery-thumb{width:100%;height:120px;background-size:contain;background-position:center center;background-repeat:no-repeat;background-color:var(--dsw-alias-bg-base)}',
      '.gallery-panel .meta{padding:8px 10px;display:flex;flex-direction:column;gap:5px;min-height:80px}',
      '.gallery-panel .tag{display:inline-block;align-self:flex-start;font-size:11px;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-radius:999px;padding:1px 8px}',
      '.gallery-panel .cap{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.gallery-panel .acts{display:flex;gap:6px;margin-top:auto}',
      '.gallery-panel .acts button{padding:3px 10px;font-size:12px;border-radius:6px}',
      '.gallery-panel .acts button.danger:hover{border-color:#e5484d;color:#e5484d}',
      '.gallery-panel .album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;width:100%}',
      '.gallery-panel .album-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;transition:transform .12s ease,box-shadow .12s ease}',
      '.gallery-panel .album-card.open{cursor:pointer}',
      '.gallery-panel .album-card:hover{transform:translateY(-2px);box-shadow:0 5px 14px rgba(0,0,0,.12)}',
      '.gallery-panel .album-cover{position:relative;width:100%;height:136px;background-color:var(--dsw-alias-bg-base);display:flex;align-items:center;justify-content:center;font-size:26px;color:var(--dsw-alias-label-secondary)}',
      '.gallery-panel .album-cover-img{position:absolute;inset:0;background-size:cover;background-position:center 28%;background-repeat:no-repeat}',
      '.gallery-panel .album-cover-fallback{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-2))}',
      '.gallery-panel .album-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}',
      '.gallery-panel .album-title{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.gallery-panel .album-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gallery-panel .album-meta{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gallery-panel .album-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}',
      '.gallery-panel .album-acts button{padding:3px 12px;font-size:12px;border-radius:6px}',
      '.gallery-panel .album-acts button.danger:hover{border-color:#e5484d;color:#e5484d}',
      '.gallery-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}',
      '.gallery-modal{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;width:340px;max-width:100%;box-shadow:0 10px 36px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:10px}',
      '.gallery-modal h3{margin:0;font-size:14px;font-weight:600}',
      '.gallery-modal .field{display:flex;flex-direction:column;gap:4px}',
      '.gallery-modal input[type=text],.gallery-modal select,.gallery-modal textarea{box-sizing:border-box;width:100%}',
      '.gallery-modal .field label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gallery-modal .hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.gallery-modal .field.bad label{color:#e5484d}',
      '.gallery-modal .field.bad input[type=text]{border-color:#e5484d}',
      '.gallery-modal .modal-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:2px}',
      '.gallery-modal .modal-acts button{padding:6px 14px}',
      '.gallery-modal .gallery-shot{width:100%;height:220px;border-radius:8px;background-size:contain;background-position:center center;background-repeat:no-repeat;background-color:var(--dsw-alias-bg-base)}',
      '.gallery-modal-head{display:flex;align-items:flex-start;gap:8px;margin:-4px -4px 0 0}',
      '.gallery-modal-head h3{flex:1;margin:0}',
      '.gallery-panel .gallery-x{flex:none;border:none;background:transparent;cursor:pointer;font-size:18px;line-height:1;padding:2px 8px;border-radius:6px;color:var(--dsw-alias-label-secondary)}',
      '.gallery-panel .gallery-x:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:transparent}',
      // 一级标签栏 + 市场卡片：语义见 INTERFACE.md §9 / §10
      '.gallery-panel .gallery-tabs{display:flex;gap:18px;border-bottom:1px solid var(--dsw-alias-border-l1);width:100%}',
      '.gallery-panel .gallery-tab{border:none;background:transparent;cursor:pointer;font-size:13px;color:var(--dsw-alias-label-secondary);padding:4px 2px 8px;border-bottom:2px solid transparent;margin-bottom:-1px;border-radius:0;transition:color .12s}',
      '.gallery-panel .gallery-tab:hover{color:var(--dsw-alias-label-primary);background:transparent;border-color:transparent;border-bottom-color:transparent}',
      '.gallery-panel .gallery-tab.on{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.gallery-panel .gm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;width:100%}',
      '.gallery-panel .gm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;transition:transform .12s ease,box-shadow .12s ease}',
      '.gallery-panel .gm-card.open{cursor:pointer}',
      '.gallery-panel .gm-card:hover{transform:translateY(-2px);box-shadow:0 5px 14px rgba(0,0,0,.12)}',
      '.gallery-panel .gm-cover{position:relative;width:100%;height:136px;background-color:var(--dsw-alias-bg-base);display:flex;align-items:center;justify-content:center;font-size:26px;color:var(--dsw-alias-label-secondary)}',
      '.gallery-panel .gm-cover-img{position:absolute;inset:0;background-size:cover;background-position:center 28%;background-repeat:no-repeat}',
      '.gallery-panel .gm-cover-fallback{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-2))}',
      '.gallery-panel .gm-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}',
      '.gallery-panel .gm-title{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.gallery-panel .gm-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gallery-panel .gm-meta{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gallery-panel .gm-desc{font-size:12px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.gallery-panel .gm-chips{display:flex;gap:4px;flex-wrap:wrap}',
      '.gallery-panel .gm-chip{font-size:10px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:1px 8px}',
      '.gallery-panel .gm-progress-wrap{display:flex;flex-direction:column;gap:3px}',
      '.gallery-panel .gm-progress{height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.gallery-panel .gm-progress-bar{height:100%;background:var(--dsw-alias-brand-primary);border-radius:999px;transition:width .3s ease}',
      '.gallery-panel .gm-progress-text{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.gallery-panel .gm-progress-unknown{width:35%;animation:gm-slide 1.2s ease-in-out infinite}',
      '@keyframes gm-slide{0%{margin-left:0}50%{margin-left:65%}100%{margin-left:0}}',
      '.gallery-panel .gm-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}',
      '.gallery-panel .gm-acts button{padding:3px 12px;font-size:12px;border-radius:6px}',
      '.gallery-panel .gm-acts button.danger:hover{border-color:#e5484d;color:#e5484d}',
      '.gallery-panel .gm-empty{width:100%;color:var(--dsw-alias-label-secondary);padding:20px;text-align:center;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;font-size:12px}',
      '.gallery-modal .gm-preview{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px;max-height:300px;overflow:auto;padding:2px}',
      '.gallery-modal .gm-preview a{display:block;height:84px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background-size:contain;background-position:center;background-repeat:no-repeat;background-color:var(--dsw-alias-bg-base)}',
    ].join('')

    async function apiGet(params) {
      const qs = new URLSearchParams()
      if (params.tag) qs.set('tag', params.tag)
      if (params.q) qs.set('q', params.q)
      if (params.albumId) qs.set('albumId', params.albumId)
      // 语义见 INTERFACE.md §9.4
      if (params.remoteDir) qs.set('remoteDir', '1')
      return (await fetch('/dsh-gallery-api?' + qs.toString())).json()
    }
    async function apiPost(payload) {
      return (await fetch('/dsh-gallery-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })).json()
    }

    // 语义见 INTERFACE.md §9
    function fmtCount(n) {
      const x = Number(n) || 0
      return x >= 1000 ? (Math.round(x / 100) / 10) + 'k' : String(x)
    }
    function fmtBytes(n) {
      const x = Number(n) || 0
      if (x < 1024) return x + ' B'
      if (x < 1048576) return Math.round(x / 1024) + ' KB'
      return (Math.round((x / 1048576) * 10) / 10) + ' MB'
    }

    function GalleryPanel() {
      const h = React.createElement
      const [images, setImages] = React.useState([])
      const [tags, setTags] = React.useState([])
      const [total, setTotal] = React.useState(0)
      const [q, setQ] = React.useState('')
      const [tagFilter, setTagFilter] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [edit, setEdit] = React.useState(null)
      const [uploadOpen, setUploadOpen] = React.useState(false)
      const [uploading, setUploading] = React.useState(false)
      const [upTag, setUpTag] = React.useState('')
      const [upNewTag, setUpNewTag] = React.useState('')
      const [upCaption, setUpCaption] = React.useState('')
      const [upKeywords, setUpKeywords] = React.useState('')
      const [upFile, setUpFile] = React.useState(null)
      const [upData64, setUpData64] = React.useState('')
      const [upPreview, setUpPreview] = React.useState('')
      const fileRef = React.useRef(null)
      const [albums, setAlbums] = React.useState([])
      const [albumId, setAlbumId] = React.useState('')
      const [albumsDir, setAlbumsDir] = React.useState('')
      const [albumsDirInput, setAlbumsDirInput] = React.useState('')
      const [albumView, setAlbumView] = React.useState('')
      const [rootNotice, setRootNotice] = React.useState('')
      const [browseOpen, setBrowseOpen] = React.useState(false)
      const [browseList, setBrowseList] = React.useState(null)
      const [browseErr, setBrowseErr] = React.useState('')
      const [albumDialog, setAlbumDialog] = React.useState(false)
      const [albumDraft, setAlbumDraft] = React.useState({ id: '', name: '' })
      const [albumTouched, setAlbumTouched] = React.useState({})
      const [albumSaving, setAlbumSaving] = React.useState(false)
      const [confirmBox, setConfirmBox] = React.useState(null)
      // 市场 / 设置：语义见 INTERFACE.md §9 / §10
      const [panelTab, setPanelTab] = React.useState('library')
      const [remoteDir, setRemoteDir] = React.useState(null)
      const [remoteJobs, setRemoteJobs] = React.useState({})
      const [remoteBusy, setRemoteBusy] = React.useState(false)
      const [remoteQuery, setRemoteQuery] = React.useState('')
      const [remoteDirUrlInput, setRemoteDirUrlInput] = React.useState('')
      const [previewPack, setPreviewPack] = React.useState(null)
      const [importing, setImporting] = React.useState(false)
      const importFileRef = React.useRef(null)

      // 语义见 INTERFACE.md §7
      const applyState = (res) => {
        if (!res || !res.ok) return
        if (Array.isArray(res.albums)) setAlbums(res.albums)
        if (typeof res.albumId === 'string') setAlbumId(res.albumId)
        if (typeof res.albumsDir === 'string') {
          setAlbumsDir(res.albumsDir)
          setAlbumsDirInput(res.albumsDir)
        }
        // 语义见 INTERFACE.md §9.4
        if (typeof res.remoteDirUrl === 'string') setRemoteDirUrlInput(res.remoteDirUrl)
      }
      const load = async (query, tagf) => {
        setBusy(true)
        try {
          const res = await apiGet({ q: query || '', tag: tagf || '' })
          if (res && res.ok) {
            setImages(Array.isArray(res.images) ? res.images : [])
            setTags(Array.isArray(res.tags) ? res.tags : [])
            setTotal(res.total || 0)
            applyState(res)
            setNotice('')
          } else {
            setNotice('加载失败' + (res && res.error ? ': ' + res.error : ''))
          }
        } catch (error) {
          setNotice('加载失败: ' + (error && error.message ? error.message : String(error)))
        }
        setBusy(false)
      }
      React.useEffect(() => { load('', '') }, [])

      const albumIdOk = /^[a-z0-9][a-z0-9_-]{0,39}$/.test(albumDraft.id.trim())
      const albumNameOk = albumDraft.name.trim().length > 0 && albumDraft.name.trim().length <= 60
      const albumDraftOk = albumIdOk && albumNameOk
      const albumBad = (key) => !!albumTouched[key] && !(key === 'id' ? albumIdOk : albumNameOk)
      const albumSubmitOnEnter = (e) => { if (e.key === 'Enter' && albumDraftOk && !albumSaving) saveAlbum() }

      const saveAlbum = async () => {
        if (albumSaving || !albumDraftOk) return
        setAlbumSaving(true)
        setRootNotice('正在新建专辑…')
        try {
          const res = await apiPost({ op: 'createAlbum', id: albumDraft.id.trim(), name: albumDraft.name.trim() })
          if (!res || !res.ok) throw new Error((res && res.error) || '操作失败')
          applyState(res)
          setAlbumView(res.albumId || '')
          setQ('')
          setTagFilter('')
          await load('', '')
          setRootNotice(res.message || '专辑已新建并切换')
          setAlbumDialog(false)
        } catch (error) { setRootNotice(error.message || '操作失败，请重试') }
        finally { setAlbumSaving(false) }
      }

      const onOpenAlbum = async (id) => {
        const next = String(id || '').trim()
        if (!next) return
        try {
          if (next !== albumId) {
            const res = await apiPost({ op: 'setAlbum', albumId: next })
            if (!res || !res.ok) { setRootNotice('打开失败: ' + ((res && res.error) || '')); return }
            applyState(res)
          }
          setAlbumView(next)
          setQ('')
          setTagFilter('')
          await load('', '')
        } catch (e) { setRootNotice('打开失败') }
      }

      const onToggleAlbum = async (id, next) => {
        try {
          const res = await apiPost({ op: 'setAlbumEnabled', albumId: id, enabled: next })
          if (!res || !res.ok) throw new Error((res && res.error) || '操作失败')
          applyState(res)
          setRootNotice(res.message || '')
          await load(q, tagFilter)
        } catch (error) { setRootNotice(error.message || '操作失败') }
      }

      const onDeleteAlbum = async (id) => {
        try {
          const res = await apiPost({ op: 'deleteAlbum', albumId: id })
          if (!res || !res.ok) throw new Error((res && res.error) || '删除失败')
          applyState(res)
          if (albumView === id) setAlbumView('')
          setRootNotice(res.message || '已删除')
          await load('', '')
        } catch (error) { setRootNotice(error.message || '删除失败') }
      }
      const onDeleteAlbumPrompt = (a) => {
        setRootNotice('')
        setConfirmBox({
          title: '删除专辑',
          lines: [
            '确认删除专辑「' + (a.name || a.id) + '」？',
            '该专辑目录和里面的图片都会被删掉，不可恢复。',
            ...(a.id === albumId ? ['这是当前专辑，删除后会自动切到别的专辑。'] : []),
          ],
          confirmLabel: '删除',
          onConfirm: () => onDeleteAlbum(a.id),
        })
      }

      const onSaveAlbumsDir = async (dirArg) => {
        const dir = String(dirArg !== undefined ? dirArg : albumsDirInput || '').trim()
        if (!dir) { setRootNotice('扫描目录不能为空'); return }
        try {
          const res = await apiPost({ op: 'setAlbumsDir', albumsDir: dir })
          if (res && res.ok) {
            applyState(res)
            setRootNotice(res.message || '已更新扫描目录')
            if (albumView && !(res.albums || []).some((a) => a.id === albumView)) setAlbumView('')
            await load('', '')
          } else {
            setRootNotice('保存失败: ' + ((res && res.error) || ''))
          }
        } catch (e) { setRootNotice('保存失败') }
      }

      const browseFetch = async (path) => {
        const res = await apiPost({ op: 'browse', path: path || '' })
        if (!res || !res.ok) throw new Error((res && res.error) || '读取失败')
        return { path: res.path, parent: res.parent, entries: res.entries }
      }
      const browseTo = async (path) => {
        setBrowseErr('')
        try {
          setBrowseList(await browseFetch(path))
        } catch (e) {
          setBrowseErr('读取失败: ' + (e && e.message ? e.message : String(e)))
        }
      }
      const onPickDir = async () => {
        setBrowseErr('')
        setBrowseList(null)
        try {
          setBrowseList(await browseFetch(String(albumsDirInput || '').trim()))
        } catch (e) {
          setRootNotice('打开目录浏览器失败: ' + (e && e.message ? e.message : String(e)))
        }
        setBrowseOpen(true)
      }

      // ---- 专辑市场：语义见 INTERFACE.md §9.4 ----
      const loadRemoteDir = async () => {
        try {
          const res = await apiGet({ remoteDir: 1 })
          if (res && res.ok) setRemoteDir(Array.isArray(res.remoteDir) ? res.remoteDir : [])
          else setRemoteDir(null)
          applyState(res)
        } catch (e) { setRemoteDir(null) }
      }
      React.useEffect(() => {
        let alive = true
        apiGet({ remoteDir: 1 }).then((res) => {
          if (alive && res && res.ok) {
            setRemoteDir(Array.isArray(res.remoteDir) ? res.remoteDir : [])
            applyState(res)
          }
        }).catch(() => {})
        return () => { alive = false }
      }, [])
      const trackJob = (res, entry) => {
        const id = String((res && (res.jobId || res.id)) || '')
        if (!id) return false
        setRemoteJobs((cur) => ({
          ...cur,
          [id]: { ...res, jobId: id, packId: (res && res.packId) || (entry && entry.id) || '' },
        }))
        return true
      }
      const pollRemoteJob = async (jobId) => {
        try {
          const res = await apiPost({ op: 'remoteJobStatus', jobId })
          if (!res || !res.ok) {
            setRemoteJobs((cur) => { const n = { ...cur }; delete n[jobId]; return n })
            return
          }
          if (res.state === 'running' || !res.state) {
            setRemoteJobs((cur) => ({ ...cur, [jobId]: { ...cur[jobId], ...res } }))
            return
          }
          setRemoteJobs((cur) => { const n = { ...cur }; delete n[jobId]; return n })
          setRootNotice(res.message || (res.state === 'error' ? '下载失败' : '远程图库已就绪'))
          if (res.state !== 'error') {
            await load('', '')
            await loadRemoteDir()
          }
        } catch (e) { /* 下一轮轮询再试 */ }
      }
      React.useEffect(() => {
        const ids = Object.keys(remoteJobs)
        if (ids.length === 0) return
        const t = setInterval(() => { for (const id of ids) pollRemoteJob(id) }, 1200)
        return () => clearInterval(t)
      }, [remoteJobs])
      const onInstallEntry = async (entry) => {
        const archiveUrl = String((entry && entry.archiveUrl) || '').trim()
        const manifestUrl = String((entry && entry.manifestUrl) || '').trim()
        if (!archiveUrl && !manifestUrl) { setRootNotice('该条目既没有 ZIP 直链也没有清单地址'); return }
        setRemoteBusy(true)
        setRootNotice((archiveUrl ? '正在下载并校验「' : '正在按清单订阅「') + (entry.name || entry.id || '图库') + '」…')
        try {
          // 有 ZIP 直链走整包安装；只有清单地址的按逐图清单订阅（语义见 INTERFACE.md §9.4）
          const res = archiveUrl
            ? await apiPost({
              op: 'installRemoteArchive', archiveUrl,
              sha256: entry.sha256 || '', packId: entry.id || '',
              name: entry.name || '', version: entry.version || '',
            })
            : await apiPost({ op: 'subscribeRemote', manifestUrl, packId: entry.id || '' })
          if (res && res.ok && trackJob(res, entry)) {
            setRootNotice('「' + (entry.name || entry.id || '图库') + '」开始下载安装…')
          } else if (res && res.ok) {
            setRootNotice(res.message || '已安装')
            await load('', '')
            await loadRemoteDir()
          } else {
            setRootNotice('安装失败: ' + ((res && res.error) || '未知错误'))
          }
        } catch (e) {
          setRootNotice('安装失败: ' + (e && e.message ? e.message : String(e)))
        }
        setRemoteBusy(false)
      }
      const onUpdateEntry = async (entry) => {
        setRemoteBusy(true)
        setRootNotice('正在更新「' + (entry.name || entry.id || '图库') + '」…')
        try {
          const res = await apiPost({ op: 'updateRemotePack', packId: entry.id || '' })
          if (res && res.ok && trackJob(res, entry)) {
            setRootNotice('「' + (entry.name || entry.id || '图库') + '」开始更新…')
          } else if (res && res.ok) {
            setRootNotice(res.message || '已更新')
            await load('', '')
            await loadRemoteDir()
          } else {
            setRootNotice('更新失败: ' + ((res && res.error) || '未知错误'))
          }
        } catch (e) {
          setRootNotice('更新失败: ' + (e && e.message ? e.message : String(e)))
        }
        setRemoteBusy(false)
      }
      const onSaveRemoteDirUrl = async () => {
        const url = String(remoteDirUrlInput || '').trim()
        try {
          const res = await apiPost({ op: 'setRemoteDirUrl', remoteDirUrl: url })
          if (res && res.ok) {
            applyState(res)
            setRootNotice(res.message || (url ? '已更新目录源' : '已恢复内置默认源'))
            await loadRemoteDir()
          } else {
            setRootNotice('保存失败: ' + ((res && res.error) || ''))
          }
        } catch (e) { setRootNotice('保存失败') }
      }
      const onImportAlbum = (ev) => {
        const file = ev.target.files && ev.target.files[0]
        ev.target.value = ''
        if (!file) return
        setImporting(true)
        const reader = new FileReader()
        reader.onload = async () => {
          const b64 = String(reader.result || '').split(',')[1] || ''
          const name = String(file.name || '').replace(/\.zip$/i, '')
          setRootNotice('导入中…')
          try {
            const res = await apiPost({ op: 'importAlbum', dataBase64: b64, name })
            if (res && res.ok) {
              applyState(res)
              setRootNotice(res.message || '导入成功')
              await load('', '')
              await loadRemoteDir()
            } else {
              setRootNotice('导入失败: ' + ((res && res.error) || ''))
            }
          } catch (e) { setRootNotice('导入失败') }
          setImporting(false)
        }
        reader.onerror = () => { setImporting(false); setRootNotice('读取文件失败') }
        reader.readAsDataURL(file)
      }
      const onExportAlbum = async (id, name) => {
        const target = String(id || '').trim()
        if (!target) { setRootNotice('先选一个专辑'); return }
        try {
          setRootNotice('正在导出…')
          const response = await fetch('/dsh-gallery-export?albumId=' + encodeURIComponent(target))
          if (!response.ok) throw new Error((await response.text()) || '导出失败')
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = 'dsh-gallery-' + target + '.zip'
          document.body.appendChild(link)
          link.click()
          link.remove()
          setTimeout(() => URL.revokeObjectURL(url), 60000)
          setRootNotice('已导出「' + (name || target) + '」的 ZIP')
        } catch (error) {
          setRootNotice((error && error.message) || '导出失败，请重试')
        }
      }
      // 预览弹窗：已安装读本地专辑，未安装先试 previewManifest、再退回目录里的预览图。语义见 INTERFACE.md §9.4
      const openPreview = async (entry) => {
        const pid = String((entry && entry.id) || '')
        const catalogImages = [
          ...(entry && entry.preview ? [entry.preview] : []),
          ...(entry && Array.isArray(entry.previews) ? entry.previews : []),
        ]
        const installed = !!albums.find((a) => a.id === pid)
        setPreviewPack({
          packId: pid, name: (entry && entry.name) || pid,
          meta: [entry && entry.version ? 'v' + String(entry.version).replace(/^v/i, '') : '',
            entry && entry.count ? entry.count + ' 张' : '',
            entry && entry.downloads ? '↓ ' + fmtCount(entry.downloads) : ''].filter(Boolean).join(' · '),
          desc: (entry && entry.description) || '',
          tags: Array.isArray(entry && entry.keywords) ? entry.keywords : [],
          images: [...new Set(catalogImages)].filter(Boolean),
          total: Number(entry && entry.count) || 0,
          loading: installed || !!(entry && entry.manifestUrl),
          fromPack: false,
        })
        if (!installed && entry && entry.manifestUrl) {
          try {
            const res = await apiPost({ op: 'previewManifest', manifestUrl: entry.manifestUrl })
            if (res && res.ok && Array.isArray(res.urls) && res.urls.length) {
              setPreviewPack((cur) => (cur && cur.packId === pid
                ? { ...cur, images: res.urls, total: Number(res.total) || res.urls.length, loading: false, fromPack: true }
                : cur))
              return
            }
          } catch (e) { /* 清单读不到就用目录里的预览图 */ }
        }
        if (!installed) {
          setPreviewPack((cur) => (cur && cur.packId === pid ? { ...cur, loading: false } : cur))
          return
        }
        try {
          const res = await apiGet({ albumId: pid })
          const urls = (res && Array.isArray(res.images)) ? res.images.map((m) => m.url).filter(Boolean) : []
          if (urls.length) {
            setPreviewPack((cur) => (cur && cur.packId === pid
              ? { ...cur, images: urls.slice(0, 60), total: urls.length, loading: false, fromPack: true }
              : cur))
            return
          }
        } catch (e) { /* 读不到就用目录里的预览图 */ }
        setPreviewPack((cur) => (cur && cur.packId === pid ? { ...cur, loading: false } : cur))
      }

      const onDeleteTag = (tagArg) => {
        const tag = tagArg || (upTag === '__new__' ? '' : String(upTag || '').trim())
        if (!tag) return
        setConfirmBox({
          title: '删除分类',
          lines: ['确认删除分类「' + tag + '」？', '这个分类下的图片会一起删掉，不可恢复。'],
          confirmLabel: '删除分类',
          onConfirm: () => doDeleteTag(tag),
        })
      }
      const doDeleteTag = async (tag) => {
        try {
          const res = await apiPost({ op: 'deleteTag', tag })
          setNotice(res && res.ok ? '已删除分类，共 ' + (res.deleted || 0) + ' 张' : '删除失败: ' + ((res && res.error) || ''))
          setUpTag('')
          setUpNewTag('')
          await load(q, tagFilter === tag ? '' : tagFilter)
        } catch (error) {
          setNotice('删除失败: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const onPickFile = (ev) => {
        const file = ev.target.files && ev.target.files[0]
        ev.target.value = ''
        if (!file) return
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
          setNotice('仅支持 jpg/png/gif/webp')
          return
        }
        setUpFile(file)
        setUpPreview(URL.createObjectURL(file))
        setUpData64('')
        const reader = new FileReader()
        reader.onload = () => setUpData64(String(reader.result || '').split(',')[1] || '')
        reader.onerror = () => setNotice('读取文件失败')
        reader.readAsDataURL(file)
      }

      const onConfirmUpload = async () => {
        const file = upFile
        if (!file) { setNotice('先选择图片文件'); return }
        if (!upData64) { setNotice('图片还没读好，稍等片刻再试'); return }
        const tag = upTag === '__new__' ? String(upNewTag || '').trim().toLowerCase() : String(upTag || '').trim()
        if (!tag) { setNotice('先选择或填写分类'); return }
        if (!/^[a-z0-9_-]+$/.test(tag)) { setNotice('分类只能是小写字母/数字/-/_'); return }
        setUploading(true)
        try {
          const res = await apiPost({
            op: 'upload',
            tag,
            caption: String(upCaption || '').trim(),
            keywords: String(upKeywords || '').trim(),
            fileName: file.name,
            dataBase64: upData64,
          })
          if (res && res.ok) {
            setNotice('已上传: ' + (res.rel || ''))
            setUploadOpen(false)
            setUpFile(null)
            setUpPreview('')
            setUpData64('')
            setUpTag('')
            setUpNewTag('')
            setUpCaption('')
            setUpKeywords('')
            await load(q, tagFilter)
          } else {
            setNotice('上传失败: ' + ((res && res.error) || ''))
          }
        } catch (error) {
          setNotice('上传失败: ' + (error && error.message ? error.message : String(error)))
        }
        setUploading(false)
      }

      const onSaveEdit = async () => {
        if (!edit) return
        try {
          const tag = edit.tag === '__new__' ? String(edit.newTag || '').trim().toLowerCase() : String(edit.tag || '').trim().toLowerCase()
          const res = await apiPost({
            op: 'update',
            path: edit.path,
            tag,
            caption: String(edit.caption || ''),
            keywords: String(edit.keywords || ''),
          })
          setNotice(res && res.ok ? '已保存' : '保存失败: ' + ((res && res.error) || ''))
          setEdit(null)
          await load(q, tagFilter)
        } catch (error) {
          setNotice('保存失败: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const onDelete = (m) => {
        setConfirmBox({
          title: '删除图片',
          lines: ['确认删除这张图片？', m.path, '不可恢复。'],
          confirmLabel: '删除',
          onConfirm: () => doDelete(m),
        })
      }
      const doDelete = async (m) => {
        try {
          const res = await apiPost({ op: 'delete', path: m.path })
          setNotice(res && res.ok ? '已删除' : '删除失败: ' + ((res && res.error) || ''))
          await load(q, tagFilter)
        } catch (error) {
          setNotice('删除失败: ' + (error && error.message ? error.message : String(error)))
        }
      }

      const curAlbum = albums.find((a) => a.id === albumId) || null
      const searchInput = h('input', {
        type: 'text',
        placeholder: '搜索描述/关键词',
        value: q,
        onChange: (e) => setQ(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') load(q, tagFilter) },
        style: { width: 180 },
      })
      const tagSelect = h('select', {
        value: tagFilter,
        onChange: (e) => { setTagFilter(e.target.value); load(q, e.target.value) },
      }, [
        h('option', { key: '', value: '' }, '全部分类'),
        tags.map((t) => h('option', { key: t, value: t }, t)),
      ])
      const fileInput = h('input', {
        ref: fileRef,
        type: 'file',
        accept: 'image/*',
        style: { display: 'none' },
        onChange: onPickFile,
      })

      const imageCards = images.map((m) => h('div', { key: m.path, className: 'gallery-card' },
        // 用背景层而不是 <img>:宿主对 img 的全局样式会把它挤到左边
        h('div', { className: 'gallery-thumb', style: { backgroundImage: 'url("' + m.url + '")' }, title: m.caption || m.file_name }),
        h('div', { className: 'meta' },
          m.tag ? h('div', { className: 'tag' }, m.tag) : null,
          h('div', { className: 'cap' }, m.caption || m.file_name),
          h('div', { className: 'acts' },
            h('button', { onClick: () => setEdit({ path: m.path, tag: m.tag, caption: m.caption || '', keywords: m.keywords || '' }) }, '编辑'),
            h('button', { className: 'danger', onClick: () => onDelete(m) }, '删除'),
          ),
        ),
      ))

      const albumCards = albums.map((a) => h('div', {
        key: a.id,
        className: 'album-card open',
        title: '点击打开',
        onClick: () => onOpenAlbum(a.id),
      },
        a.cover
          ? h('div', { className: 'album-cover' },
            (a.name || a.id || '?').slice(0, 1),
            h('div', { className: 'album-cover-img', style: { backgroundImage: 'url("' + a.cover + '")' } }))
          : h('div', { className: 'album-cover album-cover-fallback' }, (a.name || a.id || '?').slice(0, 1)),
        h('div', { className: 'album-body' },
          h('div', { className: 'album-title' },
            h('span', { className: 'album-name', title: a.name }, a.name || a.id),
            h('span', {
              className: 'switch' + (a.enabled ? ' on' : ''),
              title: a.enabled ? '模型可以使用这个专辑，点击关闭' : '点击打开：模型可以用这个专辑发图',
              onClick: (e) => { e.stopPropagation(); onToggleAlbum(a.id, !a.enabled) },
            }),
          ),
          h('div', { className: 'album-meta' }, (a.count || 0) + ' 张' + (a.id === albumId ? ' · 当前专辑' : '')),
          h('div', { className: 'album-acts', onClick: (e) => e.stopPropagation() },
            h('button', { onClick: () => onExportAlbum(a.id, a.name) }, '导出'),
            h('button', { className: 'danger', disabled: albumSaving, onClick: () => onDeleteAlbumPrompt(a) }, '删除'),
          ),
        ),
      ))

      // 发现页卡片：语义见 INTERFACE.md §9.1 / §9.4
      const gmQuery = remoteQuery.trim().toLowerCase()
      const gmMatch = (hay) => !gmQuery || gmQuery.split(/\s+/).filter(Boolean).every((t) => hay.includes(t))
      const jobFor = (pid) => Object.values(remoteJobs).find((j) => j.packId === pid)
      const discoverCards = (() => {
        const cards = []
        for (const entry of (remoteDir || [])) {
          const pid = String(entry.id || '')
          const keywords = Array.isArray(entry.keywords) ? entry.keywords : (Array.isArray(entry.tags) ? entry.tags : [])
          const hay = ((entry.name || '') + ' ' + (entry.description || '') + ' ' + keywords.join(' ') + ' ' + pid).toLowerCase()
          if (!gmMatch(hay)) continue
          const local = pid ? albums.find((a) => a.id === pid) : null
          cards.push({
            key: 'dir-' + (pid || entry.manifestUrl || entry.archiveUrl),
            entry, packId: pid,
            name: entry.name || pid,
            desc: entry.description || '',
            cover: (local && local.cover) ? local.cover : (entry.preview || (entry.previews || [])[0] || null),
            meta: [
              entry.version ? 'v' + String(entry.version).replace(/^v/i, '') : '',
              entry.count ? entry.count + ' 张' : '',
              entry.downloads ? '↓ ' + fmtCount(entry.downloads) : '',
            ].filter(Boolean).join(' · '),
            tags: keywords,
            installed: !!local,
            job: jobFor(pid),
            downloads: Number(entry.downloads) || 0,
          })
        }
        // 默认按下载量排序；同分保持目录原顺序（Array#sort 稳定）
        cards.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
        return cards
      })()
      // 市场卡片：封面 + 名称 + meta + 简介 + 标签 + 进度 + 操作。语义见 INTERFACE.md §9.4
      const gmCard = (row, acts, onOpen) => {
        const job = row.job
        const pct = job && job.total ? Math.round((((job.done || 0) + (job.failed || 0)) / job.total) * 100) : 0
        const bytes = job && typeof job.bytes === 'number' && !job.total ? ' ' + fmtBytes(job.bytes) : ''
        return h('div', {
          key: row.key,
          className: 'gm-card' + (onOpen ? ' open' : ''),
          ...(onOpen ? { onClick: () => onOpen(), title: '点击打开' } : {}),
        },
          row.cover
            ? h('div', { className: 'gm-cover' },
              (row.name || '?').slice(0, 1),
              h('div', { className: 'gm-cover-img', style: { backgroundImage: 'url("' + row.cover + '")' } }))
            : h('div', { className: 'gm-cover gm-cover-fallback' }, (row.name || '?').slice(0, 1)),
          h('div', { className: 'gm-body' },
            h('div', { className: 'gm-title' }, h('span', { className: 'gm-name', title: row.name }, row.name)),
            row.meta ? h('div', { className: 'gm-meta', title: row.meta }, row.meta) : null,
            row.desc ? h('div', { className: 'gm-desc', title: row.desc }, row.desc) : null,
            row.tags && row.tags.length
              ? h('div', { className: 'gm-chips' }, row.tags.slice(0, 4).map((t) => h('span', { key: t, className: 'gm-chip' }, t)))
              : null,
            job ? h('div', { className: 'gm-progress-wrap' },
              h('div', { className: 'gm-progress' },
                // total 为 0 = 上游没给 content-length：画不确定进度条，别假装 100%
                job.total
                  ? h('div', { className: 'gm-progress-bar', style: { width: pct + '%' } })
                  : h('div', { className: 'gm-progress-bar gm-progress-unknown' })),
              h('span', { className: 'gm-progress-text' }, (job.message || '下载中…') + (job.total ? ' ' + pct + '%' : bytes)),
            ) : null,
            h('div', { className: 'gm-acts', onClick: (e) => e.stopPropagation() }, acts),
          ),
        )
      }

      return h('div', { className: 'gallery-panel' },
        // 三个一级标签：语义见 INTERFACE.md §10
        h('div', { className: 'gallery-tabs' },
          h('button', {
            className: 'gallery-tab' + (panelTab === 'library' ? ' on' : ''),
            onClick: () => setPanelTab('library'),
          }, '专辑' + (albums.length ? ' (' + albums.length + ')' : '')),
          h('button', {
            className: 'gallery-tab' + (panelTab === 'market' ? ' on' : ''),
            onClick: () => { setRootNotice(''); setPanelTab('market') },
          }, '发现'),
          h('button', {
            className: 'gallery-tab' + (panelTab === 'settings' ? ' on' : ''),
            onClick: () => setPanelTab('settings'),
          }, '设置'),
        ),
        panelTab === 'library' ? (albumView ? h(React.Fragment, null,
          h('div', { className: 'row', style: { width: '100%' } },
            h('button', { onClick: () => { setAlbumView(''); setRootNotice('') } }, '← 专辑列表'),
            h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
              (curAlbum ? curAlbum.name : albumView) + ' · ' + total + ' 张'),
          ),
          h('div', { className: 'row' },
            searchInput,
            h('button', { className: 'btn-primary', onClick: () => setUploadOpen(true) }, '上传图片'),
            tagSelect,
            h('button', { onClick: () => load(q, tagFilter), disabled: busy }, '搜索'),
          ),
          notice ? h('div', { className: 'notice' }, notice) : null,
          images.length === 0 && !busy
            ? h('div', { className: 'empty' }, '没有匹配的图片')
            : h('div', { className: 'gallery-grid' }, imageCards),
        ) : h(React.Fragment, null,
          h('div', { className: 'row', style: { width: '100%' } },
            h('button', {
              className: 'btn-primary', disabled: albumSaving,
              onClick: () => { setAlbumDraft({ id: 'album-' + Date.now().toString(36), name: '' }); setAlbumTouched({}); setAlbumDialog(true) },
            }, '新建专辑'),
            h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, '点专辑卡片进入图片页'),
          ),
          albums.length === 0
            ? h('div', { className: 'empty' }, '还没有专辑')
            : h('div', { className: 'album-grid' }, albumCards),
        )) : null,
        // 发现页：语义见 INTERFACE.md §9.1 / §9.4
        panelTab === 'market' ? h(React.Fragment, null,
          h('div', { className: 'row', style: { width: '100%' } },
            h('input', {
              type: 'text', value: remoteQuery, onChange: (e) => setRemoteQuery(e.target.value),
              placeholder: '搜索图库…', style: { flex: 1, minWidth: 160 },
            }),
            h('button', { onClick: () => loadRemoteDir() }, '刷新'),
          ),
          discoverCards.length === 0
            ? h('div', { className: 'gm-empty' },
              gmQuery
                ? '没有匹配的图库'
                : (remoteDir === null ? '图库目录暂不可用（检查网络或稍后重试）' : '目录暂无内容'))
            : h('div', { className: 'gm-grid' }, discoverCards.map((row) => gmCard(row, [
              // 已安装的条目不重复给「安装」，改给「更新」
              row.installed
                ? h('button', {
                  key: 'update', disabled: remoteBusy || !!row.job,
                  onClick: () => onUpdateEntry(row.entry),
                }, '更新')
                : h('button', {
                  key: 'install', className: 'btn-primary',
                  disabled: remoteBusy || !!row.job || !(row.entry.archiveUrl || row.entry.manifestUrl),
                  title: (row.entry.archiveUrl || row.entry.manifestUrl) ? undefined : '该条目既没有 ZIP 直链也没有清单地址',
                  onClick: () => onInstallEntry(row.entry),
                }, row.job ? '下载中…' : '安装'),
            ], () => openPreview(row.entry)))),
        ) : null,
        // 设置页：语义见 INTERFACE.md §9.4 / §10
        panelTab === 'settings' ? h(React.Fragment, null,
          h('div', { className: 'section-title' }, '扫描目录'),
          h('div', { className: 'row', style: { width: '100%' } },
            h('input', {
              type: 'text', value: albumsDirInput, placeholder: '自动扫描含 index.db 的子文件夹',
              onChange: (e) => setAlbumsDirInput(e.target.value), style: { flex: 1, minWidth: 160 },
            }),
            h('button', { onClick: () => onPickDir() }, '选择目录'),
            h('button', { className: 'btn-primary', onClick: () => onSaveAlbumsDir() }, '保存'),
          ),
          albumsDir ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-all' } }, albumsDir) : null,
          h('div', { className: 'section-title' }, '目录源地址'),
          h('div', { className: 'row', style: { width: '100%' } },
            h('input', {
              type: 'text', value: remoteDirUrlInput, placeholder: '留空 = 使用内置默认源',
              onChange: (e) => setRemoteDirUrlInput(e.target.value), style: { flex: 1, minWidth: 160 },
            }),
            h('button', { className: 'btn-primary', onClick: () => onSaveRemoteDirUrl() }, '保存'),
          ),
          h('div', { className: 'section-title' }, '导入 / 导出'),
          h('div', { className: 'row', style: { width: '100%', flexWrap: 'wrap' } },
            h('button', {
              disabled: importing,
              onClick: () => importFileRef.current && importFileRef.current.click(),
            }, importing ? '导入中…' : '导入专辑 ZIP'),
            h('button', {
              disabled: !(albums.find((a) => a.id === albumId) || albums[0]),
              onClick: () => {
                const a = albums.find((x) => x.id === albumId) || albums[0]
                if (a) onExportAlbum(a.id, a.name)
              },
            }, '导出当前专辑'),
            h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
              '导出 = 当前专辑打成 ZIP；每个专辑卡片上也有「导出」'),
          ),
          h('input', {
            ref: importFileRef, type: 'file', accept: '.zip,application/zip',
            style: { display: 'none' }, onChange: onImportAlbum,
          }),
        ) : null,
        rootNotice ? h('div', { className: 'notice' }, rootNotice) : null,
        edit ? h('div', { className: 'gallery-modal-mask', onClick: () => setEdit(null) },
          h('div', { className: 'gallery-modal', onClick: (e) => e.stopPropagation() },
            h('h3', null, '编辑图片'),
            h('div', {
              className: 'gallery-shot',
              style: { backgroundImage: 'url("' + ((images.find((m) => m.path === edit.path) || {}).url || '') + '")' },
            }),
            h('div', { className: 'field' },
              h('label', null, '分类'),
              h('div', { className: 'row', style: { width: '100%' } },
                h('select', { value: edit.tag, onChange: (e) => setEdit({ ...edit, tag: e.target.value }), style: { flex: 1 } },
                  (tags.includes(edit.tag) ? tags : [edit.tag, ...tags]).map((t) => h('option', { key: t, value: t }, t)),
                  h('option', { value: '__new__' }, '+ 新建分类'),
                ),
                h('button', { onClick: () => onDeleteTag(edit.tag), disabled: !edit.tag || edit.tag === '__new__', title: '删除该分类及其中所有图片' }, '删除分类'),
              ),
              edit.tag === '__new__'
                ? h('input', { type: 'text', value: edit.newTag || '', placeholder: '新分类名，小写字母/数字/-/_', onChange: (e) => setEdit({ ...edit, newTag: e.target.value }), style: { width: '100%' } })
                : null,
            ),
            h('div', { className: 'field' },
              h('label', null, '描述'),
              h('textarea', { value: edit.caption, placeholder: '一句话描述', rows: 2, onChange: (e) => setEdit({ ...edit, caption: e.target.value }) }),
            ),
            h('div', { className: 'field' },
              h('label', null, '关键词(空格分隔)'),
              h('input', { type: 'text', value: edit.keywords, placeholder: '搜索用', onChange: (e) => setEdit({ ...edit, keywords: e.target.value }) }),
            ),
            h('div', { className: 'modal-acts' },
              h('button', { onClick: () => setEdit(null) }, '取消'),
              h('button', { className: 'btn-primary', onClick: onSaveEdit }, '保存'),
            ),
          ),
        ) : null,
        uploadOpen ? h('div', { className: 'gallery-modal-mask', onClick: () => setUploadOpen(false) },
          h('div', { className: 'gallery-modal', onClick: (e) => e.stopPropagation() },
            h('h3', null, '上传图片'),
            upFile
              ? h('div', { className: 'gallery-shot', style: { backgroundImage: 'url("' + upPreview + '")' }, title: upFile.name })
              : h('div', { className: 'empty', style: { padding: '24px', border: '1px dashed var(--dsw-alias-border-l1)', borderRadius: 8 } },
                '还没有选择图片',
              ),
            h('div', { className: 'field' },
              h('label', null, upFile ? '已选: ' + upFile.name : '文件'),
              h('button', { onClick: () => fileRef.current && fileRef.current.click() }, upFile ? '更换图片' : '选择图片'),
            ),
            h('div', { className: 'field' },
              h('label', null, '分类(必填)'),
              h('div', { className: 'row', style: { width: '100%' } },
                h('select', { value: upTag, onChange: (e) => setUpTag(e.target.value), style: { flex: 1 } },
                  h('option', { value: '' }, '选择分类'),
                  tags.map((t) => h('option', { key: t, value: t }, t)),
                  h('option', { value: '__new__' }, '+ 新建分类'),
                ),
                h('button', { onClick: () => onDeleteTag(), disabled: !upTag || upTag === '__new__', title: '删除该分类及其中所有图片' }, '删除分类'),
              ),
              upTag === '__new__'
                ? h('input', { type: 'text', value: upNewTag, placeholder: '新分类名，小写字母/数字/-/_', onChange: (e) => setUpNewTag(e.target.value), style: { width: '100%' } })
                : null,
            ),
            h('div', { className: 'field' },
              h('label', null, '描述'),
              h('textarea', { value: upCaption, placeholder: '一句话描述', rows: 2, onChange: (e) => setUpCaption(e.target.value) }),
            ),
            h('div', { className: 'field' },
              h('label', null, '关键词(空格分隔)'),
              h('input', { type: 'text', value: upKeywords, placeholder: '搜索用', onChange: (e) => setUpKeywords(e.target.value) }),
            ),
            h('div', { className: 'modal-acts' },
              h('button', { onClick: () => setUploadOpen(false) }, '取消'),
              h('button', { className: 'btn-primary', onClick: onConfirmUpload, disabled: uploading }, uploading ? '上传中…' : '上传'),
            ),
          ),
        ) : null,
        albumDialog ? h('div', { className: 'gallery-modal-mask', onClick: () => { if (!albumSaving) setAlbumDialog(false) } },
          h('div', { className: 'gallery-modal', style: { width: 400 }, onClick: (e) => e.stopPropagation() },
            h('div', { className: 'gallery-modal-head' },
              h('h3', null, '新建专辑'),
              h('button', { className: 'gallery-x', title: '关闭', 'aria-label': '关闭', disabled: albumSaving, onClick: () => setAlbumDialog(false) }, '×'),
            ),
            rootNotice ? h('div', { className: 'notice', role: 'status' }, rootNotice) : null,
            h('div', { className: 'field' + (albumBad('name') ? ' bad' : '') },
              h('label', null, '专辑名称'),
              h('input', {
                type: 'text', value: albumDraft.name, maxLength: 60, autoFocus: true,
                placeholder: '如：猫咪、壁纸', disabled: albumSaving,
                onChange: (e) => { setAlbumTouched({ ...albumTouched, name: true }); setAlbumDraft({ ...albumDraft, name: e.target.value }) },
                onKeyDown: albumSubmitOnEnter,
              }),
              albumBad('name') ? h('div', { className: 'hint' }, '起个名字，专辑列表用它显示') : null,
            ),
            h('div', { className: 'field' + (albumBad('id') ? ' bad' : '') },
              h('label', null, '专辑 ID'),
              h('input', {
                type: 'text', value: albumDraft.id, maxLength: 40, disabled: albumSaving,
                placeholder: '如：my-cat',
                onChange: (e) => { setAlbumTouched({ ...albumTouched, id: true }); setAlbumDraft({ ...albumDraft, id: e.target.value }) },
                onKeyDown: albumSubmitOnEnter,
              }),
              h('div', { className: 'hint' }, albumBad('id')
                ? '只能用小写字母、数字、- 和 _，首字符不能是 - 或 _（1–40 位）'
                : '专辑就装在这个文件夹名下'),
            ),
            h('div', { className: 'modal-acts' },
              h('button', { disabled: albumSaving, onClick: () => setAlbumDialog(false) }, '取消'),
              h('button', {
                className: 'btn-primary',
                disabled: albumSaving || !albumDraftOk,
                title: !albumDraftOk ? '先填专辑名称和合法的专辑 ID' : undefined,
                onClick: saveAlbum,
              }, albumSaving ? '处理中…' : '创建并切换'),
            ),
          ),
        ) : null,
        confirmBox ? h('div', { className: 'gallery-modal-mask', onClick: () => setConfirmBox(null) },
          h('div', { className: 'gallery-modal', onClick: (e) => e.stopPropagation() },
            h('h3', null, confirmBox.title),
            (confirmBox.lines || []).map((line, i) => h('p', { key: i }, line)),
            h('div', { className: 'row', style: { marginTop: 16 } },
              h('button', {
                className: 'btn-primary',
                onClick: () => { const run = confirmBox.onConfirm; setConfirmBox(null); if (run) run() },
              }, confirmBox.confirmLabel || '确认'),
              h('button', { onClick: () => setConfirmBox(null) }, '取消'),
            ),
          ),
        ) : null,
        browseOpen && browseList ? h('div', { className: 'gallery-modal-mask', onClick: () => setBrowseOpen(false) },
          h('div', { className: 'gallery-modal', style: { width: 420 }, onClick: (e) => e.stopPropagation() },
            h('h3', null, '选择专辑目录'),
            h('div', { style: { wordBreak: 'break-all', fontSize: 12 } }, browseList.path),
            h('div', { className: 'row', style: { gap: 4 } },
              h('button', {
                onClick: () => { if (browseList.parent) browseTo(browseList.parent) },
                disabled: !browseList.parent,
                style: { padding: '3px 8px', fontSize: 12 },
              }, '⬆ 上一级'),
            ),
            h('div', { style: { height: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 4 } },
              (browseList.entries || []).length === 0
                ? h('div', { className: 'empty' }, '(空目录)')
                : (browseList.entries || []).map((e) =>
                  h('button', { key: e.path, onClick: () => browseTo(e.path), style: { textAlign: 'left', padding: '5px 10px', fontSize: 13 } },
                    '📁 ' + e.name)),
            ),
            browseErr ? h('div', { className: 'notice' }, browseErr) : null,
            h('div', { className: 'modal-acts' },
              h('button', { onClick: () => setBrowseOpen(false) }, '取消'),
              h('button', {
                className: 'btn-primary',
                onClick: () => { onSaveAlbumsDir(browseList.path); setBrowseOpen(false) },
              }, '使用此目录'),
            ),
          ),
        ) : null,
        // 市场预览弹窗：语义见 INTERFACE.md §9.1 / §9.4
        previewPack ? h('div', { className: 'gallery-modal-mask', onClick: () => setPreviewPack(null) },
          h('div', {
            className: 'gallery-modal', style: { width: 560, maxHeight: '82vh', overflow: 'auto' },
            onClick: (e) => e.stopPropagation(),
          },
            h('div', { className: 'gallery-modal-head' },
              h('h3', null, previewPack.name),
              h('button', {
                className: 'gallery-x', title: '关闭', 'aria-label': '关闭',
                onClick: () => setPreviewPack(null),
              }, '×'),
            ),
            previewPack.meta ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, previewPack.meta) : null,
            previewPack.desc ? h('p', { style: { margin: 0, fontSize: 12 } }, previewPack.desc) : null,
            previewPack.tags.length
              ? h('div', { className: 'gm-chips' }, previewPack.tags.map((t) => h('span', { key: t, className: 'gm-chip' }, t)))
              : null,
            previewPack.loading ? h('div', { className: 'notice' }, '正在读取图库图片…') : null,
            previewPack.images.length
              ? h('div', { className: 'gm-preview' }, previewPack.images.map((u, i) => h('a', {
                key: u + '#' + i, href: u, target: '_blank', rel: 'noopener noreferrer', title: '点开原图',
                style: { backgroundImage: 'url("' + u + '")' },
              })))
              : (previewPack.loading ? null : h('div', { className: 'empty' }, '这个图库没有提供预览图')),
            previewPack.images.length && previewPack.total > previewPack.images.length
              ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                previewPack.fromPack
                  ? '共 ' + previewPack.total + ' 张，这里显示前 ' + previewPack.images.length + ' 张'
                  : '目录里提供 ' + previewPack.images.length + ' 张预览；这个图库共 ' + previewPack.total + ' 张，安装后可以看全部')
              : null,
          ),
        ) : null,
        fileInput,
      )
    }

    // ---- 输入框选图器 ----
    const pickerCSS = [
      '.gallery-trigger{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:transparent;border:none;line-height:1;outline:none;transition:background .12s,color .12s}',
      '.gallery-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.gallery-trigger.active{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}',
      '.gallery-picker{position:absolute;bottom:calc(100% + 8px);left:0;width:min(360px,90vw);z-index:30;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:10px;padding:12px;max-height:46vh;overflow:hidden;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.gallery-picker .gp-tabs{display:flex;gap:4px;align-items:center;overflow-x:auto;max-width:100%;padding-bottom:2px}',
      '.gallery-picker .gp-tag{padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);cursor:pointer;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;flex:none;transition:background .12s,color .12s,border-color .12s}',
      '.gallery-picker .gp-tag:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
      '.gallery-picker .gp-tag.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1)}',
      '.gallery-picker .gp-grid{overflow-y:auto;display:flex;flex-wrap:wrap;gap:8px;max-height:38vh;padding:2px}',
      '.gallery-picker .gp-cell{width:76px;height:76px;flex:0 0 76px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;overflow:hidden;cursor:pointer;background-color:var(--dsw-alias-bg-layer-2);background-size:cover;background-position:center center;background-repeat:no-repeat;padding:0;display:block;transition:border-color .12s,transform .12s,box-shadow .12s}',
      '.gallery-picker .gp-cell:hover{border-color:var(--dsw-alias-brand-primary);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.15)}',
      '.gallery-picker .gp-empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:28px 0}',
    ].join('')

    function makePickerStore() {
      let open = false
      const subs = new Set()
      return {
        get: () => open,
        set: (v) => { open = !!v; subs.forEach((fn) => fn()) },
        toggle: () => { open = !open; subs.forEach((fn) => fn()) },
        subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn) },
      }
    }

    function makePickerButton(store) {
      return function PickerButton() {
        const open = React.useSyncExternalStore(store.subscribe, store.get)
        return React.createElement('button', {
          className: open ? 'gallery-trigger active' : 'gallery-trigger',
          title: '图片收藏',
          onClick: (e) => {
            e.preventDefault(); e.stopPropagation()
            store.toggle()
          },
        }, React.createElement('svg', { viewBox: '0 0 24 24', width: 20, height: 20, style: { display: 'block' } },
          React.createElement('path', {
            d: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
            fill: 'currentColor',
          }),
        ))
      }
    }

    function GalleryBoard(props) {
      const h = React.createElement
      const store = props.store
      const actions = props.inputActions
      // 草稿要实时读(宿主输入栏就是 useInput((s) => s));拿不到钩子时兜底为空串
      const useLiveInput = typeof props.useInput === 'function' ? props.useInput : (() => null)
      const inputState = useLiveInput((s) => s)
      const open = React.useSyncExternalStore(store.subscribe, store.get)
      const [images, setImages] = React.useState([])
      const [albums, setAlbums] = React.useState([])
      const [albumId, setAlbumId] = React.useState('')

      React.useEffect(() => {
        if (!open) return
        let alive = true
        const qs = new URLSearchParams()
        if (albumId) qs.set('albumId', albumId)
        fetch('/dsh-gallery-api?' + qs.toString())
          .then((r) => r.json())
          .then((res) => {
            if (!alive || !res || !res.ok) return
            setAlbums(Array.isArray(res.albums) ? res.albums : [])
            setImages(Array.isArray(res.images) ? res.images : [])
            // 首次打开锚定当前专辑;切走后无效则回退当前专辑
            setAlbumId((cur) => {
              const valid = (res.albums || []).some((a) => a.id === cur)
              return cur && valid ? cur : (res.albumId || '')
            })
          })
          .catch(() => {})
        return () => { alive = false }
      }, [open, albumId])

      // 点外部(非面板、非按钮)收起
      React.useEffect(() => {
        if (!open) return
        const onDown = (e) => {
          const t = e && e.target
          if (t && t.closest && !t.closest('.gallery-picker') && !t.closest('.gallery-trigger')) {
            store.set(false)
          }
        }
        document.addEventListener('pointerdown', onDown)
        return () => document.removeEventListener('pointerdown', onDown)
      }, [open])

      if (!open) return null

      // 点一张图 = 写入该图的 markdown(用户侧发图);语义见 INTERFACE.md §5.2 / §8
      const send = (m) => {
        if (!m) return
        const target = m.albumId || albumId
        // 记账失败不阻塞发送
        try { apiPost({ op: 'touch', albumId: target, path: m.path }).catch(() => {}) } catch (e) {}
        const alt = String(m.caption || m.file_name || '图片').replace(/[\[\]\n\r]/g, ' ').slice(0, 80) || '图片'
        const text = '![' + alt + '](' + m.url + ')'
        const cur = inputState && typeof inputState.draft === 'string' ? inputState.draft : ''
        try { if (actions && actions.setDraft) actions.setDraft(cur.trim() ? cur + '\n' + text : text) } catch (e) {}
        try { if (actions && actions.submit) actions.submit() } catch (e) {}
        store.set(false)
      }

      const cells = images.map((m) => h('div', {
        key: m.path,
        className: 'gp-cell',
        title: m.caption || m.file_name,
        onClick: () => send(m),
        style: { backgroundImage: 'url("' + m.url + '")' },
      }))

      return h('div', { className: 'gallery-picker', onClick: (e) => e.stopPropagation() },
        h('div', { className: 'gp-tabs' },
          albums.length === 0
            ? h('div', { className: 'gp-empty', style: { padding: '4px 0' } }, '暂无专辑')
            : albums.map((a) => h('button', {
              type: 'button', key: a.id,
              className: 'gp-tag' + (a.id === albumId ? ' on' : ''),
              onClick: () => setAlbumId(a.id),
            }, (a.name || a.id) + ' (' + (a.count || 0) + ')')),
        ),
        images.length === 0
          ? h('div', { className: 'gp-empty' }, '这个专辑还没有图片')
          : h('div', { className: 'gp-grid' }, cells),
      )
    }

    const inject = ['slots', 'workspaces']

    function apply(ctx) {
      const styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(() => () => { styleEl.remove() }, 'dsh-gallery: styles')

      const pickerStyle = document.createElement('style')
      pickerStyle.textContent = pickerCSS
      document.head.appendChild(pickerStyle)
      ctx.effect(() => () => { pickerStyle.remove() }, 'dsh-gallery: picker styles')

      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'gallery', order: 25, label: '图片收藏' },
        () => React.createElement(GalleryPanel),
      ))

      const store = makePickerStore()
      // 组件必须在渲染回调外创建:否则每次重渲染都是新组件类型,触发器会被反复卸载重挂
      const PickerButton = makePickerButton(store)
      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: 'gallery-picker', order: 5, label: '图片收藏' },
        () => React.createElement(PickerButton),
      ))
      slots.inject('conversation.input.overlay', () => slots.register(
        { name: 'conversation.input.overlay', id: 'gallery-picker', order: 5, label: '图片收藏' },
        (props) => React.createElement(GalleryBoard, {
          store,
          inputActions: props.inputActions,
          useInput: props.useInput,
        }),
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
