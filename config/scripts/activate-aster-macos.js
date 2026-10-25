ObjC.import('AppKit')

globalThis.run = function (argv) {
  const pid = Number(argv[0])
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return 'invalid pid'
  }
  const application = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid)
  if (!application) {
    return 'not running'
  }
  if (argv[1] === '--probe') {
    return 'running'
  }
  application.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)
  return 'activated'
}
