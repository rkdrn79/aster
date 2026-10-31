export type HomeScreenPlatform = 'ios-safari' | 'ios-other' | 'android' | 'other'

/** Which browser's Add to Home Screen steps to show; iPadOS reports a Mac with touch. */
export function homeScreenPlatform(userAgent: string, maxTouchPoints: number): HomeScreenPlatform {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (ios) {
    // Why: Chrome, Firefox and Edge on iOS keep Add to Home Screen in their own Share menus.
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent) ? 'ios-other' : 'ios-safari'
  }
  return /Android/.test(userAgent) ? 'android' : 'other'
}

function addStep(platform: HomeScreenPlatform, canPrompt: boolean): string {
  if (canPrompt) {
    return 'Tap Install Aster.'
  }
  switch (platform) {
    case 'ios-safari':
      return 'Tap Share in Safari’s toolbar, then Add to Home Screen.'
    case 'ios-other':
      return 'Tap Share in the address bar, then Add to Home Screen.'
    case 'android':
      return 'Open the browser menu, then Install app or Add to Home screen.'
    case 'other':
      return 'Use the browser menu to add Aster to the Home Screen.'
  }
}

/**
 * How to put the web client on the Home Screen here, as numbered steps. iOS gives the app its own
 * storage, so it needs the link; an installed Android app usually shares this browser's pairing.
 */
export function homeScreenSteps(
  platform: HomeScreenPlatform,
  options: { canPrompt: boolean; hasLink: boolean }
): string[] {
  const add = addStep(platform, options.canPrompt)
  if (!options.hasLink) {
    return [add]
  }
  if (options.canPrompt || platform === 'android') {
    return [add, 'If the app asks to connect, copy the link below and paste it there.']
  }
  return ['Copy the link below.', add, 'Open Aster from the Home Screen and paste the link.']
}
