import { useEffect } from 'react'

const MEMBER_MANIFEST = '/manifest.webmanifest'
const ADMIN_MANIFEST = '/manifest-admin.webmanifest'
const MEMBER_APP_TITLE = 'MUCY'
const ADMIN_APP_TITLE = 'MUCY Admin'
const MEMBER_PAGE_TITLE = 'Cyprus Manchester United Supporters Club'
const ADMIN_PAGE_TITLE = 'MUCY Admin — Cyprus Manchester United Supporters Club'

export function useWebAppManifest(isAdminRoute: boolean) {
  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (manifestLink) {
      manifestLink.href = isAdminRoute ? ADMIN_MANIFEST : MEMBER_MANIFEST
    }

    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (appleTitle) {
      appleTitle.content = isAdminRoute ? ADMIN_APP_TITLE : MEMBER_APP_TITLE
    }

    document.title = isAdminRoute ? ADMIN_PAGE_TITLE : MEMBER_PAGE_TITLE
  }, [isAdminRoute])
}
