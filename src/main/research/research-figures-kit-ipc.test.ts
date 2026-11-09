import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./research-harness-ipc', () => {
  const directory = path.resolve('src/research-harness')
  return {
    researchHarnessDirectory: () => directory,
    callHarness: async (file: string, name: string, ...args: unknown[]) => {
      const loaded: unknown = await import(pathToFileURL(path.join(directory, file)).href)
      const fn: unknown = typeof loaded === 'object' && loaded ? Reflect.get(loaded, name) : null
      return typeof fn === 'function' ? Reflect.apply(fn, null, args) : null
    }
  }
})

import { buildFigureTemplate, listFigureTemplates } from './research-figures-kit-ipc'

describe('figure kit IPC', () => {
  it('lists the kit templates with what each draws', async () => {
    const templates = await listFigureTemplates()
    expect(templates.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['transformer', 'lora', 'diffusion'])
    )
    expect(templates.every((entry) => entry.description.length > 0)).toBe(true)
  })

  it('draws a template with the kit in the asked style', async () => {
    const scene: unknown = JSON.parse(
      await buildFigureTemplate({ name: 'lora', style: 'neutral', accent: 'blue' })
    )
    const elements = Reflect.get(Object(scene), 'elements')
    const ids = Array.isArray(elements)
      ? elements.map((element) => Reflect.get(Object(element), 'id'))
      : []
    expect(ids).toEqual(expect.arrayContaining(['lora-w', 'lora-a', 'lora-b', 'lora-w-frozen']))
  })

  it('refuses names that are not template names', async () => {
    await expect(buildFigureTemplate({ name: '../x', style: null, accent: null })).rejects.toThrow()
  })
})
