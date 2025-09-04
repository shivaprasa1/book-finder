/*
BOOK FINDER — React + Tailwind (Play CDN) — Open Library Search
================================================================

👤 Persona: Alex (College student) wants a fast, no-login book search that supports
- Title/Author/ISBN/Subject/Free text search
- Covers, authors, years, subjects
- Client-side filters (year range, language), sorting, pagination
- Favorites (saved in browser)
- Quick links to Open Library pages

API USED (no auth):
- Search: https://openlibrary.org/search.json
- Covers: https://covers.openlibrary.org/b/id/{cover_i}-M.jpg

----------------------------------------------------------------
QUICK SETUP (StackBlitz/CodeSandbox)
----------------------------------------------------------------
1) Create a new React (Vite) project on StackBlitz or CodeSandbox.
2) Open public/index.html (or index.html) and add Tailwind Play CDN in <head>:
   <script src="https://cdn.tailwindcss.com"></script>
3) Replace src/App.jsx with THIS file's content.
4) Ensure your entry file renders <App /> (Vite default is src/main.jsx). If needed:
   import React from 'react'
   import ReactDOM from 'react-dom/client'
   import App from './App.jsx'
   ReactDOM.createRoot(document.getElementById('root')).render(<App />)
5) Hit “Share/Deploy” and submit the live URL.

----------------------------------------------------------------
README (include in your repo)
----------------------------------------------------------------
# Book Finder (React + Tailwind)
A lightweight, no-login book search for students using Open Library.

## Features
- Search by Title, Author, ISBN, Subject, or Free Text
- Rich results (covers, authors, year, subjects)
- Filters: language, year range
- Sorting: relevance (default), title, year ↑/↓
- Pagination (client-side) & Load More from API
- Favorites saved in localStorage
- Keyboard shortcuts: `/` focus search, `f` toggle favorites

## Tech
- React (hooks only), Tailwind (Play CDN), Open Library APIs

## Running
- Use StackBlitz/CodeSandbox (recommended) or clone & run with Vite:
  npm i
  npm run dev

## Deployment
- Share the StackBlitz/CodeSandbox URL, or deploy to Vercel/Netlify.

----------------------------------------------------------------
Accessibility
----------------------------------------------------------------
- Semantic buttons/labels, keyboard navigable, focus styles via Tailwind ring classes.

*/

import React, { useEffect, useMemo, useRef, useState } from 'react'

const PER_PAGE = 20
const OPENLIB_BASE = 'https://openlibrary.org'

// Utilities ----------------------------------------------------
const cls = (...xs) => xs.filter(Boolean).join(' ')
const uniqueBy = (arr, key) => {
  const seen = new Set()
  return arr.filter((x) => (seen.has(x[key]) ? false : seen.add(x[key])))
}

function buildSearchURL({ mode, query, apiPage }) {
  const url = new URL(`${OPENLIB_BASE}/search.json`)
  const params = new URLSearchParams()

  // Choose one of the supported parameters or free text
  if (mode === 'title') params.set('title', query)
  else if (mode === 'author') params.set('author', query)
  else if (mode === 'isbn') params.set('isbn', query)
  else if (mode === 'subject') params.set('subject', query)
  else params.set('q', query) // free text

  params.set('page', String(apiPage))
  // Ask for only the fields we need (API ignores unknown params safely)
  params.set(
    'fields',
    [
      'key',
      'title',
      'author_name',
      'first_publish_year',
      'cover_i',
      'edition_key',
      'language',
      'subject',
      'isbn',
    ].join(',')
  )
  // Try to keep payload small if supported; API will ignore if not.
  params.set('limit', '100')
  url.search = params.toString()
  return url.toString()
}

function coverURL(doc) {
  if (doc?.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
  const isbn = doc?.isbn?.[0]
  if (isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
  return null
}

function openLibraryWorkURL(doc) {
  // e.g., key: "/works/OL12345W"
  return doc?.key ? `${OPENLIB_BASE}${doc.key}` : null
}

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch {
      // Ignore localStorage errors
    }
  }, [key, val])
  return [val, setVal]
}

// Main App -----------------------------------------------------
export default function App() {
  const [mode, setMode] = useState('title') // title | author | isbn | subject | all
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState([])
  const [numFound, setNumFound] = useState(0)
  const [apiPage, setApiPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // UI state
  const [uiPage, setUiPage] = useState(1)
  const [sort, setSort] = useState('relevance') // relevance | title | year-asc | year-desc
  const [lang, setLang] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [showFav, setShowFav] = useState(false)
  const [selected, setSelected] = useState(null) // detail modal

  const [favs, setFavs] = useLocalStorage('bookfinder:favs', [])

  const searchInputRef = useRef(null)

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key.toLowerCase() === 'f') {
        setShowFav((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function resetResults() {
    setDocs([])
    setNumFound(0)
    setApiPage(1)
    setUiPage(1)
    setError('')
  }

  async function fetchPage(p) {
    const url = buildSearchURL({ mode, query: query.trim(), apiPage: p })
    setLoading(true)
    setError('')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const newDocs = (data.docs || []).map((d) => ({
        ...d,
        __id: d.key, // stable for dedupe
      }))
      setDocs((prev) => uniqueBy([...prev, ...newDocs], '__id'))
      setNumFound(data.numFound || newDocs.length)
      setApiPage(p)
    } catch (err) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e) {
    e?.preventDefault?.()
    if (!query.trim()) return
    resetResults()
    fetchPage(1)
  }

  function loadMore() {
    fetchPage(apiPage + 1)
  }

  // Derived filters & sorts
  const languagesAvailable = useMemo(() => {
    const set = new Set()
    docs.forEach((d) => (d.language || []).forEach((c) => set.add(c)))
    return Array.from(set).sort()
  }, [docs])

  const filtered = useMemo(() => {
    let out = docs
    const yf = parseInt(yearFrom || '0', 10)
    const yt = parseInt(yearTo || '9999', 10)

    if (lang) out = out.filter((d) => (d.language || []).includes(lang))
    out = out.filter((d) => {
      const y = d.first_publish_year || 0
      return y >= yf && y <= yt
    })

    if (sort === 'title') {
      out = [...out].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    } else if (sort === 'year-asc') {
      out = [...out].sort((a, b) => (a.first_publish_year || 0) - (b.first_publish_year || 0))
    } else if (sort === 'year-desc') {
      out = [...out].sort((a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0))
    }
    // relevance = API default order
    return out
  }, [docs, lang, yearFrom, yearTo, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageDocs = useMemo(() => {
    const start = (uiPage - 1) * PER_PAGE
    return filtered.slice(start, start + PER_PAGE)
  }, [filtered, uiPage])

  function toggleFav(doc) {
    const id = doc.__id
    const exists = favs.find((x) => x.__id === id)
    if (exists) setFavs(favs.filter((x) => x.__id !== id))
    else
      setFavs([
        ...favs,
        {
          __id: id,
          key: doc.key,
          title: doc.title,
          author_name: doc.author_name,
          first_publish_year: doc.first_publish_year,
          cover_i: doc.cover_i,
          isbn: doc.isbn,
        },
      ])
  }

  const isFav = (doc) => favs.some((x) => x.__id === doc.__id)

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="text-2xl font-bold tracking-tight">📚 Book Finder</div>
          <div className="text-sm text-slate-600">Open Library • React • Tailwind</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowFav((v) => !v)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
              aria-label="Toggle favorites"
            >
              ❤ Favorites ({favs.length})
            </button>
            <a
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
              href="https://openlibrary.org"
              target="_blank"
              rel="noreferrer"
            >
              Open Library
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="px-4 py-6">
          {/* Search Bar */}
          <div className="px-4 py-6">
            <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[180px_1fr_120px]">
              <select
                className="h-11 rounded-xl border border-slate-300 bg-white px-3"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                aria-label="Search mode"
              >
                <option value="title">Title</option>
                <option value="author">Author</option>
                <option value="isbn">ISBN</option>
                <option value="subject">Subject</option>
                <option value="all">Free text</option>
              </select>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search books… (press / to focus)"
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <button
                type="submit"
                className="h-11 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700 shadow"
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </form>

            {/* Filters */}
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Language</label>
                <select
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3"
                  value={lang}
                  onChange={(e) => {
                    setLang(e.target.value)
                    setUiPage(1)
                  }}
                >
                  <option value="">Any</option>
                  {languagesAvailable.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Year from</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 1950"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3"
                  value={yearFrom}
                  onChange={(e) => {
                    setYearFrom(e.target.value)
                    setUiPage(1)
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Year to</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 2025"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3"
                  value={yearTo}
                  onChange={(e) => {
                    setYearTo(e.target.value)
                    setUiPage(1)
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Sort</label>
                <select
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value)
                    setUiPage(1)
                  }}
                >
                  <option value="relevance">Relevance</option>
                  <option value="title">Title (A→Z)</option>
                  <option value="year-asc">Year ↑</option>
                  <option value="year-desc">Year ↓</option>
                </select>
              </div>
            </div>

            {/* Meta */}
            <div className="mt-3 text-sm text-slate-600 flex items-center gap-4">
              {!!docs.length && (
                <span>
                  Showing <strong>{Math.min(filtered.length, PER_PAGE)}</strong> of{' '}
                  <strong>{filtered.length}</strong> fetched results{numFound ? (
                    <> (total available: <strong>{numFound}</strong>)</>
                  ) : null}
                </span>
              )}
              {error && <span className="text-rose-600">Error: {error}</span>}
            </div>

            {/* Results */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {loading && !docs.length && (
                <SkeletonCards />
              )}
              {!loading && !docs.length && (
                <div className="col-span-full text-center text-slate-500 py-16">
                  Start by searching a book title, author, ISBN, or subject.
                </div>
              )}
              {pageDocs.map((doc) => (
                <BookCard
                  key={doc.__id}
                  doc={doc}
                  onOpen={() => setSelected(doc)}
                  onFav={() => toggleFav(doc)}
                  fav={isFav(doc)}
                />
              ))}
            </div>

            {/* Pagination */}
            {docs.length > 0 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    disabled={uiPage === 1}
                    onClick={() => setUiPage((p) => Math.max(1, p - 1))}
                    className={cls(
                      'px-3 py-2 rounded-xl border shadow-sm',
                      uiPage === 1
                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {uiPage} / {totalPages}
                  </span>
                  <button
                    disabled={uiPage >= totalPages}
                    onClick={() => setUiPage((p) => Math.min(totalPages, p + 1))}
                    className={cls(
                      'px-3 py-2 rounded-xl border shadow-sm',
                      uiPage >= totalPages
                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    Next
                  </button>
                </div>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className={cls(
                    'px-4 py-2 rounded-xl bg-sky-600 text-white font-medium shadow',
                    loading && 'opacity-60'
                  )}
                >
                  {loading ? 'Loading…' : 'Load more from API'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Favorites Drawer */}
      {showFav && (
        <div className="fixed inset-0 bg-black/20 flex" onClick={() => setShowFav(false)}>
          <aside
            className="ml-auto h-full w-full max-w-md bg-white shadow-2xl p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            aria-label="Favorites"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">❤ Favorites</h2>
              <button
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                onClick={() => setShowFav(false)}
              >
                Close
              </button>
            </div>
            {favs.length === 0 ? (
              <p className="mt-6 text-slate-600">No favorites yet. Click ❤ on any book.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {favs.map((doc) => (
                  <div key={doc.__id} className="flex gap-3 border rounded-xl p-3">
                    <Cover img={coverURL(doc)} alt={doc.title} className="h-16 w-12 rounded-lg" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{doc.title}</div>
                      <div className="text-sm text-slate-600 truncate">
                        {(doc.author_name || []).join(', ') || 'Unknown author'}
                      </div>
                      <div className="text-xs text-slate-500">{doc.first_publish_year || '—'}</div>
                      <div className="mt-2 flex gap-2">
                        <a
                          className="text-sm underline"
                          href={openLibraryWorkURL(doc) || '#'}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on Open Library
                        </a>
                        <button
                          className="text-sm text-rose-600"
                          onClick={() => setFavs(favs.filter((x) => x.__id !== doc.__id))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Details Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-[160px_1fr]">
              <div className="p-4 border-b md:border-b-0 md:border-r">
                <Cover img={coverURL(selected)} alt={selected.title} className="w-full h-64 rounded-xl" />
              </div>
              <div className="p-5">
                <h3 className="text-xl font-semibold leading-snug">{selected.title}</h3>
                <p className="text-slate-600 mt-1">
                  {(selected.author_name || []).join(', ') || 'Unknown author'}
                </p>
                <p className="text-slate-500 text-sm">First published: {selected.first_publish_year || '—'}</p>
                {selected.subject && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.subject.slice(0, 8).map((s) => (
                      <span key={s} className="px-2 py-1 bg-slate-100 rounded-full text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex items-center gap-2">
                  <button
                    onClick={() => toggleFav(selected)}
                    className={cls(
                      'px-3 py-2 rounded-xl border shadow-sm',
                      isFav(selected)
                        ? 'bg-rose-50 border-rose-200 text-rose-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {isFav(selected) ? '❤ In Favorites' : '❤ Add to Favorites'}
                  </button>
                  <a
                    href={openLibraryWorkURL(selected) || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-sky-600 text-white font-medium shadow"
                  >
                    Open on Open Library
                  </a>
                  <button
                    onClick={() => setSelected(null)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="py-10 text-center text-sm text-slate-500">
        Built for Alex • Uses public Open Library APIs • No login required
      </footer>
    </div>
  )
}

// Components ---------------------------------------------------
function BookCard({ doc, onOpen, onFav, fav }) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative">
        <Cover img={coverURL(doc)} alt={doc.title} className="w-full h-56" />
        <button
          onClick={onFav}
          className={cls(
            'absolute top-2 right-2 px-2.5 py-1 rounded-lg text-sm shadow-sm',
            fav ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-white/90 text-slate-800 border border-slate-200'
          )}
          aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
        >
          ❤
        </button>
      </div>
      <div className="p-3">
        <div className="font-medium line-clamp-2 min-h-[3rem]">{doc.title}</div>
        <div className="text-sm text-slate-600 line-clamp-1">
          {(doc.author_name || []).join(', ') || 'Unknown author'}
        </div>
        <div className="text-xs text-slate-500 mt-1">{doc.first_publish_year || '—'}</div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onOpen}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
          >
            Details
          </button>
          <a
            className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm"
            href={openLibraryWorkURL(doc) || '#'}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
        </div>
      </div>
    </div>
  )
}

function Cover({ img, alt, className }) {
  return img ? (
    <img src={img} alt={alt || 'Book cover'} className={cls('object-cover object-center', className)} />
  ) : (
    <div
      className={cls(
        'flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400',
        className
      )}
      aria-label="No cover available"
    >
      No cover
    </div>
  )
}

function SkeletonCards() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-slate-200 bg-white overflow-hidden"
        >
          <div className="h-56 bg-slate-200" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
            <div className="h-3 bg-slate-200 rounded w-1/3" />
          </div>
        </div>
      ))}
    </>
  )
}
