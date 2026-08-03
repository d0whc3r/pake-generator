// Asks for the microphone once on load and releases it right away.
//
// WebKit keeps the device list empty until capture has been granted at least
// once, and Slack gives up before opening the huddle window ("AVDeviceService
// Failed to get valid device list after 4 attempts"). Granting it up front is
// what makes the devices visible.
void (async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) {
      track.stop()
    }
  } catch (error) {
    console.warn('[pake-generator] microphone unavailable:', error)
  }
})()
