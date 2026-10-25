import { describe, expect, it } from 'vitest'
import { researchProjectTransferRequestSchema } from './research-project-transfer'

const request = {
  linkId: 'f76b1f21-6371-42c4-91b4-0f85a14e4075',
  localRoot: '/projects/paper',
  direction: 'push',
  paths: ['src', 'configs/model.yaml']
}

describe('researchProjectTransferRequestSchema', () => {
  it('accepts a chosen subset of project files', () => {
    expect(researchProjectTransferRequestSchema.safeParse(request).success).toBe(true)
  })

  it.each(['../secret', 'src/../secret', '/etc/passwd', 'src\\secret', '.', './/env', 'src//file'])(
    'rejects an escaping or ambiguous path %s',
    (path) => {
      expect(
        researchProjectTransferRequestSchema.safeParse({ ...request, paths: [path] }).success
      ).toBe(false)
    }
  )

  it('rejects duplicate paths', () => {
    expect(
      researchProjectTransferRequestSchema.safeParse({ ...request, paths: ['src', 'src'] }).success
    ).toBe(false)
  })
})
