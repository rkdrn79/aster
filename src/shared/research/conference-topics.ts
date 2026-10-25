import { z } from 'zod'

export const CONFERENCE_TOPICS = [
  { key: 'ml', label: 'Machine learning' },
  { key: 'cv', label: 'Computer vision' },
  { key: 'nlp', label: 'NLP & LLMs' },
  { key: 'speech', label: 'Speech & audio' },
  { key: 'robotics', label: 'Robotics' },
  { key: 'ai', label: 'AI & agents' },
  { key: 'data', label: 'Data, IR & DB' },
  { key: 'graphics', label: 'Graphics & media' },
  { key: 'hci', label: 'HCI' },
  { key: 'systems', label: 'Systems & networks' },
  { key: 'security', label: 'Security' },
  { key: 'se', label: 'SE & PL' },
  { key: 'theory', label: 'Theory' },
  { key: 'other', label: 'Interdisciplinary' }
] as const

export type ConferenceTopic = (typeof CONFERENCE_TOPICS)[number]['key']

export const conferenceTopicSchema = z.enum([
  'ml',
  'cv',
  'nlp',
  'speech',
  'robotics',
  'ai',
  'data',
  'graphics',
  'hci',
  'systems',
  'security',
  'se',
  'theory',
  'other'
])

export const conferenceRankSchema = z
  .object({
    ccf: z.enum(['A', 'B', 'C', 'N']).optional(),
    core: z.enum(['A*', 'A', 'B', 'C', 'N']).optional()
  })
  .strict()

export type ConferenceRank = z.infer<typeof conferenceRankSchema>

// Why: a source's category is too coarse for well-known venues (CCF files CVPR and ACL under "AI").
const SERIES_TOPICS: Record<string, ConferenceTopic> = {
  icml: 'ml',
  neurips: 'ml',
  iclr: 'ml',
  aistats: 'ml',
  colt: 'ml',
  uai: 'ml',
  alt: 'ml',
  acml: 'ml',
  cpal: 'ml',
  log: 'ml',
  probml: 'ml',
  icmla: 'ml',
  icann: 'ml',
  ijcnn: 'ml',
  iconip: 'ml',
  esann: 'ml',
  mlsys: 'ml',
  collas: 'ml',
  rlc: 'ml',
  chil: 'ml',
  cvpr: 'cv',
  iccv: 'cv',
  eccv: 'cv',
  wacv: 'cv',
  bmvc: 'cv',
  accv: 'cv',
  icpr: 'cv',
  icdar: 'cv',
  fg: 'cv',
  ijcb: 'cv',
  euvip: 'cv',
  '3dv': 'cv',
  miccai: 'cv',
  acl: 'nlp',
  emnlp: 'nlp',
  naacl: 'nlp',
  eacl: 'nlp',
  coling: 'nlp',
  conll: 'nlp',
  ijcnlp: 'nlp',
  ijcnlpaacl: 'nlp',
  nlpcc: 'nlp',
  colm: 'nlp',
  lrec: 'nlp',
  inlg: 'nlp',
  aaai: 'ai',
  ijcai: 'ai',
  ecai: 'ai',
  aamas: 'ai',
  kr: 'ai',
  icaps: 'ai',
  acmmm: 'graphics',
  icme: 'graphics',
  icassp: 'speech',
  interspeech: 'speech',
  icra: 'robotics',
  iros: 'robotics',
  rss: 'robotics',
  corl: 'robotics',
  kdd: 'data',
  www: 'data',
  wsdm: 'data',
  sigir: 'data',
  cikm: 'data',
  icdm: 'data',
  ecmlpkdd: 'data',
  ecir: 'data',
  recsys: 'data',
  pakdd: 'data'
}

const TAG_TOPICS: [RegExp, ConferenceTopic][] = [
  [/vision|image|visual|pattern/, 'cv'],
  [/natural.language|language.model|linguistic/, 'nlp'],
  [/speech|signal/, 'speech'],
  [/robot/, 'robotics'],
  [/data.mining|web|retrieval|recommend|knowledge.graph|information.systems|content/, 'data'],
  [/graphics/, 'graphics'],
  [/human.computer/, 'hci'],
  [/software/, 'se'],
  [/learning|optimization|mathematics|fairness/, 'ml'],
  [/reasoning|knowledge|semantics/, 'ai']
]

const CATEGORY_TOPICS: Record<string, ConferenceTopic> = {
  AI: 'ai',
  CG: 'graphics',
  CT: 'theory',
  DB: 'data',
  DS: 'systems',
  HI: 'hci',
  MX: 'other',
  NW: 'systems',
  SC: 'security',
  SE: 'se'
}

/** Primary topic: a curated venue mapping, then the first known tag, then the CCF category. */
export function conferenceTopic(
  series: string,
  tags: readonly string[],
  category: string | undefined
): ConferenceTopic {
  if (SERIES_TOPICS[series]) {
    return SERIES_TOPICS[series]
  }
  for (const tag of tags) {
    const match = TAG_TOPICS.find(([pattern]) => pattern.test(tag.toLowerCase()))
    if (match) {
      return match[1]
    }
  }
  return (category && CATEGORY_TOPICS[category]) || 'other'
}

export function isTopTier(rank: ConferenceRank): boolean {
  return rank.ccf === 'A' || rank.core === 'A*'
}

/** Compact rank text such as `CCF A · CORE A*`; empty when no ranking body lists the venue. */
export function formatConferenceRank(rank: ConferenceRank): string {
  return [
    rank.ccf && rank.ccf !== 'N' ? `CCF ${rank.ccf}` : null,
    rank.core && rank.core !== 'N' ? `CORE ${rank.core}` : null
  ]
    .filter(Boolean)
    .join(' · ')
}
