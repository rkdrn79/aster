// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchFigureNewDialog } from './ResearchFigureNewDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open() {
  const onCreate = vi.fn(async () => null)
  render(
    <ResearchFigureNewDialog
      open
      folder="paper/figures"
      existing={new Set()}
      draft={{ start: 'describe', name: 'Method overview' }}
      onOpenChange={() => undefined}
      onOpenExisting={() => undefined}
      onCreate={onCreate}
    />
  )
  return onCreate
}

it('makes a blank figure, with no agent, when nothing is described', async () => {
  const onCreate = open()
  const submit = screen.getByRole('button', { name: 'Create figure' })
  expect(submit.hasAttribute('disabled')).toBe(false)
  fireEvent.click(submit)
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ start: 'blank' }))
})

it('treats spaces as nothing described, and starts the agent once there is a description', async () => {
  const onCreate = open()
  const field = screen.getByLabelText('What should it show?')
  fireEvent.change(field, { target: { value: '   ' } })
  expect(screen.queryByRole('button', { name: 'Create and describe' })).toBeNull()
  fireEvent.change(field, { target: { value: 'an encoder and a decoder' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create and describe' }))
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ start: 'describe', description: 'an encoder and a decoder' })
  )
})
