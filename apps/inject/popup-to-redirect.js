// Turns login popups into full-page navigation.
//
// Why this is needed: native popups are disabled (newWindow:false) because they
// crash the app on macOS 26, and Pake's window.open only knows how to navigate
// the popup URL in the current window. That is enough when the popup goes
// straight to the provider, but not when the site opens an intermediate page
// that depends on window.opener: without an opener it just hangs.
//
// The generic part is the mechanism: intercept window.open and navigate. What
// cannot be generic is the rewrite, because every site encodes its popup
// contract its own way. Each REWRITES entry receives the popup URL and returns
// the equivalent redirect-mode URL, or null if it does not recognize it.
/** @type {Array<(popup: URL) => URL | null>} */
const REWRITES = [
  // Notion (www.notion.so, app.notion.com, calendar.notion.so). It opens
  // /verifyNoPopupBlockerHtmlAndRedirect with the real destination in
  // redirectUri, and that destination accepts callbackType=redirect to come
  // back through its own callback instead of talking to window.opener.
  (popup) => {
    if (popup.pathname !== '/verifyNoPopupBlockerHtmlAndRedirect') {
      return null
    }
    const redirectUri = popup.searchParams.get('redirectUri')
    if (!redirectUri) {
      return null
    }
    const target = new URL(redirectUri, popup.origin)
    target.searchParams.set('callbackType', 'redirect')
    return target
  },
]

// Pake wraps this file in a DOMContentLoaded listener and injects it after its
// own event.js, so window.open is already theirs by the time we get here.
const previousOpen = window.open

window.open = function (url, name, specs) {
  try {
    const popup = new URL(url, window.location.href)
    for (const rewrite of REWRITES) {
      const target = rewrite(popup)
      if (target) {
        window.location.href = target.href
        return window
      }
    }
  } catch (error) {
    console.warn('[pake-generator] could not rewrite the popup:', error)
  }
  return previousOpen.call(window, url, name, specs)
}
