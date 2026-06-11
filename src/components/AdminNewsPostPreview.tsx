import { NewsFeed } from './NewsFeed.tsx'
import type { NewsPost } from '../lib/newsApi.ts'

type AdminNewsPostPreviewProps = {
  title: string
  body: string
  imageUrl: string | null
  imageUrlMobile: string | null
  publishedAt: string
}

export function AdminNewsPostPreview({
  title,
  body,
  imageUrl,
  imageUrlMobile,
  publishedAt,
}: AdminNewsPostPreviewProps) {
  const previewPost: NewsPost = {
    id: 'admin-preview',
    title: title.trim() || 'News headline preview',
    body:
      body.trim() ||
      'Your news content will appear here as a short excerpt on the cards. The full text opens when members tap Read.',
    imageUrl,
    imageUrlMobile,
    bodyPhotos: [],
    publishedAt,
    updatedAt: publishedAt,
  }

  const noop = () => {}

  return (
    <section className="admin-news-live-preview" aria-label="Live preview before publish">
      <h3 className="admin-news-live-preview-heading">Live preview</h3>
      <p className="admin-news-live-preview-lead">
        See how this post will look on the public site before you publish. Use separate photos for the best result on
        PC and smartphone.
      </p>
      <div className="admin-news-live-preview-grid">
        <div className="admin-news-live-preview-panel">
          <p className="admin-news-live-preview-label">Desktop (PC)</p>
          <NewsFeed
            posts={[previewPost]}
            onReadPost={noop}
            idPrefix="admin-preview-desktop"
            previewLayout="desktop"
            readOnly
          />
        </div>
        <div className="admin-news-live-preview-panel admin-news-live-preview-panel--phone">
          <p className="admin-news-live-preview-label">Smartphone</p>
          <div className="admin-news-preview-phone-frame">
            <NewsFeed
              posts={[previewPost]}
              onReadPost={noop}
              idPrefix="admin-preview-mobile"
              previewLayout="mobile"
              readOnly
            />
          </div>
        </div>
      </div>
    </section>
  )
}
