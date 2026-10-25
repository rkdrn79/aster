import type { KeybindingDefinition } from './types'
import { platformBindings } from './definitions-support'

export const KEYBINDING_DEFINITION_CORE_4: readonly KeybindingDefinition[] = [
  {
    id: 'chat.find',
    title: 'Find in chat',
    group: 'Chat',
    scope: 'chat',
    searchKeywords: ['shortcut', 'chat', 'find', 'search'],
    defaultBindings: platformBindings(['Mod+F'])
  },
  {
    id: 'research.toggleExperimentDetails',
    title: 'Switch notebook and details',
    group: 'Research',
    scope: 'research',
    searchKeywords: [
      'shortcut',
      'research',
      'experiment',
      'notebook',
      'details',
      'runs',
      'compare',
      'outputs',
      'toggle',
      'switch'
    ],
    // Why: Mod+Shift+D is the terminal/chat split chord, and the docked Experiment chat honors it.
    defaultBindings: platformBindings(['Mod+Shift+K'])
  },
  {
    id: 'research.history.back',
    title: 'Go back in Research',
    group: 'Research',
    scope: 'research',
    searchKeywords: ['shortcut', 'research', 'history', 'back', 'previous', 'page'],
    // Why: browser-style chords; Ctrl+[ is Escape in terminals, so Linux/Windows use Alt+Left.
    defaultBindings: {
      darwin: ['Mod+BracketLeft'],
      linux: ['Alt+ArrowLeft'],
      win32: ['Alt+ArrowLeft']
    }
  },
  {
    id: 'research.history.forward',
    title: 'Go forward in Research',
    group: 'Research',
    scope: 'research',
    searchKeywords: ['shortcut', 'research', 'history', 'forward', 'next', 'page'],
    defaultBindings: {
      darwin: ['Mod+BracketRight'],
      linux: ['Alt+ArrowRight'],
      win32: ['Alt+ArrowRight']
    }
  },
  {
    id: 'research.commandPalette',
    title: 'Go to page, project or Experiment',
    group: 'Research',
    scope: 'research',
    searchKeywords: ['shortcut', 'research', 'command', 'palette', 'go to', 'jump', 'search'],
    // Why: Mod+K clears a focused terminal; the Research handler leaves terminals to it.
    defaultBindings: platformBindings(['Mod+K'])
  },
  {
    id: 'sidebar.childWorkspaces.toggle',
    title: 'Toggle Child Workspaces',
    group: 'Global',
    scope: 'global',
    searchKeywords: [
      'shortcut',
      'sidebar',
      'child',
      'children',
      'nested',
      'lineage',
      'workspaces',
      'worktree',
      'collapse',
      'expand',
      'show',
      'hide'
    ],
    // Why: ship unbound like the sleeping toggle, so no existing chord is claimed on any platform.
    defaultBindings: platformBindings([])
  },
  {
    id: 'terminal.clearPaneTitle',
    title: 'Clear Pane Title',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'terminal', 'pane', 'clear title', 'remove title', 'title'],
    defaultBindings: platformBindings([])
  },
  {
    id: 'terminal.closePane',
    title: 'Close active pane',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'close'],
    defaultBindings: platformBindings(['Mod+W'])
  },
  {
    id: 'terminal.splitRight',
    title: 'Split terminal right',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'split', 'right'],
    defaultBindings: {
      darwin: ['Mod+D'],
      linux: ['Mod+Shift+D'],
      win32: ['Mod+Shift+D']
    }
  },
  {
    id: 'terminal.splitDown',
    title: 'Split terminal down',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: ['shortcut', 'pane', 'split', 'down'],
    defaultBindings: {
      darwin: ['Mod+Shift+D'],
      linux: ['Alt+Shift+D'],
      win32: ['Alt+Shift+D']
    }
  },
  {
    id: 'terminal.switchInputSource',
    title: 'Switch input source / language (native)',
    group: 'Terminal Panes',
    scope: 'terminal',
    searchKeywords: [
      'shortcut',
      'input',
      'source',
      'language',
      'korean',
      'english',
      'ime',
      'switch',
      'hangul',
      'layout'
    ],
    defaultBindings: {
      darwin: [],
      linux: [],
      win32: []
    },
    // Why: macOS uses Shift+Space as an input-source shortcut; Orca otherwise rejects Shift-only bindings to avoid stealing typed text.
    allowShiftOnlyKeybindings: true
  }
]
