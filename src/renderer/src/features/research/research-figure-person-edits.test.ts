import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, string>())

vi.mock('./research-project-files', () => ({
  ProjectWriteConflict: class ProjectWriteConflict extends Error {},
  projectRecordRoot: async () => '.aster',
  readProjectText: async (_owner: unknown, path: string) => {
    const text = files.get(path)
    if (text === undefined) {
      throw new Error(`ENOENT ${path}`)
    }
    return text
  },
  writeProjectText: async (_owner: unknown, path: string, text: string) => {
    files.set(path, text)
  }
}))

import { figureFileText } from './research-figure-document'
import { figureCowork } from './research-figure-cowork-store'
import { keepFigurePersonEdits, recordFigurePersonEdits } from './research-figure-person-edits'

const target = {
  owner: { hostId: 'local', workspaceId: 'w', workspacePath: '/p' },
  folder: '.aster/figures',
  slug: 'method'
}
const SCENE = '.aster/figures/method.excalidraw'
const LEDGER = '.aster/figures/src/method.edits.json'

function scene(encX: number, label = 'z'): string {
  return figureFileText({
    type: 'excalidraw',
    version: 2,
    source: 'aster',
    elements: [
      { id: 'enc', type: 'rectangle', x: encX, y: 0, width: 100, height: 40, version: 1 },
      {
        id: 'lbl',
        type: 'text',
        x: 0,
        y: 60,
        width: 10,
        height: 20,
        text: label,
        fontSize: 16,
        version: 1
      }
    ],
    appState: {},
    files: {}
  })
}

describe('the person’s hand edits on the desktop', () => {
  beforeEach(() => files.clear())

  it('records only what the person touched, then puts it back on an agent’s rewrite', async () => {
    await recordFigurePersonEdits(target, {
      baseText: scene(0),
      savedText: scene(12, 'z_t'),
      touched: new Set(['enc'])
    })
    const ledger = JSON.parse(files.get(LEDGER) ?? '{}')
    expect(ledger.edits.map((entry: { id: string }) => entry.id)).toEqual(['enc'])
    expect(figureCowork(target).edits?.lines).toEqual(["'enc' (enc): moved 12 right"])

    const agent = scene(0)
    files.set(SCENE, agent)
    const kept = await keepFigurePersonEdits(target, agent)
    expect(kept.changed).toBe(true)
    expect(JSON.parse(files.get(SCENE) ?? '{}').elements[0].x).toBe(12)
    expect(kept.text).toBe(files.get(SCENE))
    expect((await keepFigurePersonEdits(target, kept.text)).changed).toBe(false)
  })

  it('tells the agent when its write changed what the person set', async () => {
    await recordFigurePersonEdits(target, {
      baseText: scene(0),
      savedText: scene(12),
      touched: new Set(['enc'])
    })
    await keepFigurePersonEdits(target, scene(40))
    const report = JSON.parse(files.get('.aster/cache/figures/method.kept.json') ?? '{}')
    expect(report.overrode).toEqual([{ id: 'enc', label: 'enc', prop: 'x', agent: 40, person: 12 }])
    expect(figureCowork(target).edits?.overrode).toEqual([
      "'enc' (enc) x: your run set 40, the person's 12 is kept"
    ])
  })

  it('drops an edit the person undid by restoring a version', async () => {
    await recordFigurePersonEdits(target, {
      baseText: scene(0),
      savedText: scene(12),
      touched: new Set(['enc'])
    })
    await recordFigurePersonEdits(target, {
      baseText: scene(12),
      savedText: scene(0),
      touched: new Set()
    })
    expect(JSON.parse(files.get(LEDGER) ?? '{}').edits).toEqual([])
    expect(figureCowork(target).edits).toBeNull()
  })
})
