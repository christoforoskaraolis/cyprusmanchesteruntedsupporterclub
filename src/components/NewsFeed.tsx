import { useEffect, useMemo, useRef, useState } from 'react'
import { newsDesktopImage, newsMobileImage, type NewsPost } from '../lib/newsApi.ts'

type NewsFeedProps = {
  posts: NewsPost[]
  onReadPost: (post: NewsPost) => void
  limit?: number
  idPrefix?: string
  /** Force desktop or mobile layout regardless of screen size (admin preview). */
  previewLayout?: 'responsive' | 'desktop' | 'mobile'
  /** Disable card clicks — preview only. */
  readOnly?: boolean
  /** Home page: one latest story on phones; grid unchanged on desktop. */
  variant?: 'default' | 'home'
}

function newsBodyExcerpt(body: string, maxChars = 140): string {
  const lines = body
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const first = lines[0] ?? ''
  if (first.length >= 24 && first.length <= maxChars) return first
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxChars) return flat
  return `${flat.slice(0, Math.max(24, maxChars - 1)).trim()}…`
}

function formatNewsRelativeDate(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatNewsShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function NewsFeed({
  posts,
  onReadPost,
  limit,
  idPrefix = 'news',
  previewLayout = 'responsive',
  readOnly = false,
  variant = 'default',
}: NewsFeedProps) {
  const visiblePosts = useMemo(() => (limit != null ? posts.slice(0, limit) : posts), [posts, limit])
  const mobilePosts = useMemo(
    () => (variant === 'home' ? visiblePosts.slice(0, 1) : visiblePosts),
    [visiblePosts, variant],
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActiveIndex(0)
    if (carouselRef.current) carouselRef.current.scrollLeft = 0
  }, [mobilePosts.length])

  useEffect(() => {
    const el = carouselRef.current
    if (!el || mobilePosts.length <= 1) return
    const onScroll = () => {
      const firstCard = el.querySelector<HTMLElement>('.news-feed-hero-card')
      if (!firstCard) return
      const gap = Number.parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || '0') || 10
      const step = firstCard.offsetWidth + gap
      if (step <= 0) return
      setActiveIndex(Math.min(mobilePosts.length - 1, Math.max(0, Math.round(el.scrollLeft / step))))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [mobilePosts.length])

  if (visiblePosts.length === 0) return null

  const layoutClass =
    previewLayout === 'desktop'
      ? 'news-feed--layout-desktop'
      : previewLayout === 'mobile'
        ? 'news-feed--layout-mobile'
        : ''

  const variantClass = variant === 'home' ? 'news-feed--home' : ''

  return (
    <div className={`news-feed ${layoutClass} ${variantClass} ${readOnly ? 'news-feed--readonly' : ''}`.trim()}>
      <div className="news-feed-mobile" aria-label="Latest news">
        <div className="news-feed-carousel" ref={carouselRef}>
          {mobilePosts.map((post) => {
            const titleId = `${idPrefix}-hero-title-${post.id}`
            const mobileImage = newsMobileImage(post)
            return (
              <article
                key={post.id}
                className={`news-feed-hero-card ${mobileImage ? '' : 'news-feed-hero-card--no-image'}`}
                aria-labelledby={titleId}
              >
                {mobileImage ? (
                  <div
                    className="news-feed-hero-visual"
                    style={{ backgroundImage: `url(${mobileImage})` }}
                    role="img"
                    aria-label=""
                  />
                ) : (
                  <div className="news-feed-hero-visual news-feed-hero-visual--placeholder" aria-hidden />
                )}
                <div className="news-feed-hero-overlay" aria-hidden />
                <div className="news-feed-hero-content">
                  <p className="news-feed-meta">
                    <span className="news-feed-label">News</span>
                    <span className="news-feed-meta-sep" aria-hidden>
                      ·
                    </span>
                    {formatNewsShortDate(post.publishedAt)}
                  </p>
                  <h2 id={titleId} className="news-feed-hero-title">
                    {post.title}
                  </h2>
                  <p className="news-feed-hero-excerpt">{newsBodyExcerpt(post.body)}</p>
                  <button
                    type="button"
                    className="news-feed-read-btn"
                    disabled={readOnly}
                    onClick={() => onReadPost(post)}
                  >
                    Read
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {mobilePosts.length > 1 && (
          <div className="news-feed-dots" role="tablist" aria-label="News slides">
            {mobilePosts.map((post, index) => (
              <button
                key={post.id}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`News item ${index + 1} of ${mobilePosts.length}`}
                className={`news-feed-dot ${index === activeIndex ? 'is-active' : ''}`}
                onClick={() => {
                  const el = carouselRef.current
                  const firstCard = el?.querySelector<HTMLElement>('.news-feed-hero-card')
                  if (!el || !firstCard) return
                  const gap = Number.parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || '0') || 10
                  const step = firstCard.offsetWidth + gap
                  el.scrollTo({ left: index * step, behavior: 'smooth' })
                  setActiveIndex(index)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ul className="news-feed-desktop">
        {visiblePosts.map((post) => {
          const titleId = `${idPrefix}-editorial-title-${post.id}`
          const desktopImage = newsDesktopImage(post)
          return (
            <li key={post.id}>
              <article className="news-feed-editorial-card" aria-labelledby={titleId}>
                <button
                  type="button"
                  className="news-feed-editorial-hit"
                  disabled={readOnly}
                  onClick={() => onReadPost(post)}
                >
                  <div
                    className={`news-feed-editorial-visual ${desktopImage ? '' : 'news-feed-editorial-visual--placeholder'}`}
                    style={desktopImage ? { backgroundImage: `url(${desktopImage})` } : undefined}
                    role={desktopImage ? 'img' : undefined}
                    aria-hidden={!desktopImage}
                  />
                  <div className="news-feed-editorial-body">
                    <p className="news-feed-meta news-feed-meta--editorial">
                      <span className="news-feed-label">News</span>
                      <span className="news-feed-meta-sep" aria-hidden>
                        ·
                      </span>
                      {formatNewsRelativeDate(post.publishedAt)}
                    </p>
                    <h2 id={titleId} className="news-feed-editorial-title">
                      {post.title}
                    </h2>
                  </div>
                </button>
              </article>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
