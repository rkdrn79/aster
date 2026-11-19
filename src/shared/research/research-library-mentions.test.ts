import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat-types'
import {
  findPaperMentionsInMessage,
  findPaperMentionsInText,
  paperMentionFromUrl
} from './research-library-mentions'

const keys = (text: string, citations = false): string[] =>
  findPaperMentionsInText(text, { citations }).map((mention) => mention.key)

function message(role: NativeChatMessage['role'], blocks: NativeChatMessage['blocks']) {
  return { role, blocks }
}

describe('paperMentionFromUrl', () => {
  it.each([
    ['https://arxiv.org/abs/1706.03762v7', 'arxiv:1706.03762'],
    ['https://arxiv.org/pdf/2410.12345v2.pdf', 'arxiv:2410.12345'],
    ['https://arxiv.org/html/2410.12345v1#S3', 'arxiv:2410.12345'],
    ['https://www.alphaxiv.org/abs/2410.12345', 'arxiv:2410.12345'],
    ['https://huggingface.co/papers/2410.12345', 'arxiv:2410.12345'],
    ['https://doi.org/10.1145/3292500.3330701', 'doi:10.1145/3292500.3330701'],
    ['https://dl.acm.org/doi/pdf/10.1145/3292500.3330701', 'doi:10.1145/3292500.3330701'],
    ['https://doi.org/10.48550/arXiv.2410.12345', 'arxiv:2410.12345'],
    ['https://openreview.net/forum?id=YicbFdNTTy', 'openreview:YicbFdNTTy'],
    ['https://openreview.net/pdf?id=YicbFdNTTy', 'openreview:YicbFdNTTy'],
    ['https://aclanthology.org/2023.acl-long.123/', 'doi:10.18653/v1/2023.acl-long.123'],
    ['https://aclanthology.org/N19-1423.pdf', 'doi:10.18653/v1/n19-1423'],
    [
      'https://www.semanticscholar.org/paper/Attention-is-All-you-Need-Vaswani-Shazeer/204e3073870fae3d05bcbc2f6a8e263d9b72e776',
      'title:attention is all you need vaswani shazeer'
    ],
    [
      'https://paperswithcode.com/paper/attention-is-all-you-need',
      'title:attention is all you need'
    ]
  ])('reads %s', (url, key) => {
    expect(paperMentionFromUrl(url)?.key).toBe(key)
  })

  it.each([
    'https://github.com/huggingface/transformers',
    'https://openreview.net/group?id=ICLR.cc/2025/Conference',
    'https://aclanthology.org/events/acl-2023/',
    'https://arxiv.org/list/cs.LG/recent',
    'https://www.semanticscholar.org/paper/204e3073870fae3d05bcbc2f6a8e263d9b72e776',
    'https://huggingface.co/Qwen/Qwen2.5-7B'
  ])('ignores %s', (url) => {
    expect(paperMentionFromUrl(url)).toBeNull()
  })
})

describe('findPaperMentionsInText', () => {
  it('reads arXiv citations, bare DOIs and markdown links once each', () => {
    expect(
      keys(
        'See arXiv:1706.03762, the [paper](https://arxiv.org/abs/1706.03762). Also arXiv preprint arXiv:2410.12345v2 and doi:10.1145/3292500.3330701.'
      )
    ).toEqual(['arxiv:1706.03762', 'arxiv:2410.12345', 'doi:10.1145/3292500.3330701'])
  })

  it('does not take a version number or a query string for a paper', () => {
    expect(keys('Install v2410.12345 and visit https://example.com/?doi=10.1145/x&b=1')).toEqual([
      'doi:10.1145/x'
    ])
    expect(keys('Released in arXiv 2023 and version 1706.03762 of the tool')).toEqual([])
  })

  it('reads BibTeX entries with or without identifiers', () => {
    const mentions = findPaperMentionsInText(`\`\`\`bibtex
@inproceedings{vaswani2017,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam},
  booktitle = {NeurIPS},
  year = {2017},
  eprint = {1706.03762}
}
@article{he2016deep,
  title={Deep Residual Learning for Image Recognition},
  author={He, Kaiming and Zhang, Xiangyu},
  year={2016}
}
\`\`\``)
    expect(mentions.map((mention) => mention.key)).toEqual([
      'arxiv:1706.03762',
      'title:deep residual learning for image recognition'
    ])
    expect(mentions[1]).toMatchObject({ kind: 'title', year: 2016, trusted: true })
    expect(mentions[0]).toMatchObject({ title: 'Attention Is All You Need', venue: 'NeurIPS' })
  })

  it('reads clear free-text citations only when asked', () => {
    const text = [
      'The closest work is "Attention Is All You Need" (Vaswani et al., 2017).',
      '1. Kingma, D. P., & Ba, J. (2015). Adam: A Method for Stochastic Optimization. ICLR.',
      'We like *good ideas that work well* but this has no year or authors.',
      '```\n"Not A Citation Inside Code" (Smith et al., 2020)\n```'
    ].join('\n')
    expect(keys(text)).toEqual([])
    const mentions = findPaperMentionsInText(text, { citations: true })
    expect(mentions.map((mention) => mention.key)).toEqual([
      'title:attention is all you need',
      'title:adam a method for stochastic optimization'
    ])
    expect(mentions[0]).toMatchObject({ authors: 'Vaswani et al.', year: 2017 })
    expect(mentions[1]).toMatchObject({ year: 2015 })
  })
})

describe('findPaperMentionsInMessage', () => {
  it('reads the person, the agent, its tool calls and short tool results', () => {
    expect(
      findPaperMentionsInMessage(
        message('user', [{ type: 'text', text: 'Read https://arxiv.org/abs/1706.03762' }])
      ).map((mention) => mention.key)
    ).toEqual(['arxiv:1706.03762'])
    expect(
      findPaperMentionsInMessage(
        message('assistant', [
          {
            type: 'tool-call',
            name: 'WebFetch',
            input: { url: 'https://arxiv.org/abs/2410.12345' }
          },
          {
            type: 'tool-result',
            output: 'Abstract page of arXiv:2410.12345 cites arXiv:1706.03762'
          }
        ])
      ).map((mention) => mention.key)
    ).toEqual(['arxiv:2410.12345', 'arxiv:1706.03762'])
  })

  it('leaves the harness library add call to its own request', () => {
    expect(
      findPaperMentionsInMessage(
        message('assistant', [
          {
            type: 'tool-call',
            name: 'Bash',
            input: { command: 'node H/cli.mjs library add --arxiv 2106.09685 --why prior' }
          },
          {
            type: 'tool-result',
            output: 'Asked Aster to add arXiv:2106.09685 to the project Library'
          }
        ])
      )
    ).toEqual([])
  })

  it('skips a tool result that lists many papers, reasoning, and free text from the person', () => {
    const listing = Array.from({ length: 6 }, (_, index) => `arXiv:2410.1234${index}`).join('\n')
    expect(
      findPaperMentionsInMessage(message('tool', [{ type: 'tool-result', output: listing }]))
    ).toEqual([])
    expect(
      findPaperMentionsInMessage(
        message('reasoning', [{ type: 'text', text: 'maybe arXiv:1706.03762' }])
      )
    ).toEqual([])
    expect(
      findPaperMentionsInMessage(
        message('user', [
          { type: 'text', text: 'Compare with "Attention Is All You Need" (Vaswani et al., 2017)' }
        ])
      )
    ).toEqual([])
  })
})
