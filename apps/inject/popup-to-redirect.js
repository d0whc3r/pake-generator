// Convierte los popups de login en navegacion a pagina completa.
//
// Por que hace falta: los popups nativos estan desactivados (newWindow:false)
// porque en macOS 26 crashean la app, y el window.open de Pake solo sabe
// navegar la URL del popup en la ventana actual. Eso basta cuando el popup va
// directo al proveedor, pero no cuando el sitio abre una pagina intermedia que
// depende de window.opener: sin opener se queda muerta.
//
// La parte generica es el mecanismo: interceptar window.open y navegar. Lo que
// no puede serlo es la reescritura, porque cada sitio codifica su contrato de
// popup a su manera. Cada entrada de REWRITES recibe la URL del popup y
// devuelve la URL equivalente en modo redirect, o null si no la reconoce.
const REWRITES = [
  // Notion (www.notion.so, app.notion.com, calendar.notion.so). Abre
  // /verifyNoPopupBlockerHtmlAndRedirect con el destino real en redirectUri, y
  // ese destino acepta callbackType=redirect para volver por su propio callback
  // en vez de hablar con window.opener.
  (popup) => {
    if (popup.pathname !== '/verifyNoPopupBlockerHtmlAndRedirect') {
      return null
    }
    const target = new URL(popup.searchParams.get('redirectUri'), popup.origin)
    target.searchParams.set('callbackType', 'redirect')
    return target
  },
]

// Pake envuelve este archivo en un listener de DOMContentLoaded y lo inyecta
// despues de su event.js, asi que aqui window.open ya es el suyo.
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
    console.warn('[pake-generator] no se pudo reescribir el popup:', error)
  }
  return previousOpen.call(window, url, name, specs)
}
