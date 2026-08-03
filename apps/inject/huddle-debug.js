// TEMPORARY diagnostic. Shows on screen what the page asks the app to do when
// there is no devtools: window.open calls (URL, name, what Pake returned),
// getUserMedia results and page errors. Remove from the app "inject" list and
// delete this file once the huddle problem is understood.
const box = document.createElement('pre')
box.style.cssText =
  'position:fixed;bottom:8px;left:8px;z-index:2147483647;max-width:70vw;max-height:45vh;overflow:auto;margin:0;padding:8px;font:11px/1.4 ui-monospace,monospace;background:rgba(0,0,0,.85);color:#0f0;border-radius:6px;white-space:pre-wrap'
document.body.appendChild(box)

function show(line) {
  const stamp = new Date().toTimeString().slice(0, 8)
  box.textContent = `${stamp} ${line}\n${box.textContent}`.slice(0, 6000)
}

function describeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error)
}

show('huddle-debug ready')

const previousOpen = window.open
window.open = function (url, name, specs) {
  const call = `open(${JSON.stringify(url)}, ${JSON.stringify(name)}, ${JSON.stringify(specs)})`
  let result
  try {
    result = previousOpen.call(window, url, name, specs)
  } catch (error) {
    show(`${call} -> threw ${describeError(error)}`)
    throw error
  }
  if (result === window) {
    show(`${call} -> same window`)
  } else {
    show(`${call} -> ${result === null ? 'null' : 'window object'}`)
  }
  return result
}

const media = navigator.mediaDevices
const previousGetUserMedia = media.getUserMedia.bind(media)
media.getUserMedia = (constraints) =>
  previousGetUserMedia(constraints).then(
    (stream) => {
      show(`getUserMedia(${JSON.stringify(constraints)}) -> ok`)
      return stream
    },
    (error) => {
      show(`getUserMedia(${JSON.stringify(constraints)}) -> ${describeError(error)}`)
      throw error
    },
  )
show(`getDisplayMedia: ${typeof media.getDisplayMedia}`)

window.addEventListener('error', (event) => show(`error: ${event.message}`))
window.addEventListener('unhandledrejection', (event) => show(`rejected: ${event.reason}`))
const previousConsoleError = console.error
console.error = function (...args) {
  show(`console.error: ${args.map(String).join(' ').slice(0, 300)}`)
  return previousConsoleError.apply(console, args)
}
