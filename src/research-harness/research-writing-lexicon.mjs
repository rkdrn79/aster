/**
 * Word lists and patterns of `writing check`. Calibrated on 18 published ML papers against 24
 * naive model drafts (Aster writing research, 2026-11): a pattern stays a warning only when it
 * fires clearly more often on the drafts than on the papers. All patterns run on lower-case
 * sentence text unless noted.
 */

/** Near-absent in strong papers: pattern → what to write instead. */
export const TIER_A = [
  [/\bdelv(?:e|es|ed|ing)\b/g, 'examine or study; usually cut'],
  [/\btapestry\b/g, 'cut'],
  [/\brealm\b/g, 'area or field; or cut'],
  [/\blandscape\b/g, 'field or set of methods; or cut'],
  [/\bpivotal\b/g, 'central; or name the effect'],
  [/\bseamless(?:ly)?\b/g, 'name what stays unchanged'],
  [/\bintricate\b/g, 'name the structure'],
  [/\bmeticulous(?:ly)?\b/g, 'cut'],
  [/\bshowcas(?:e|es|ed|ing)\b/g, 'show'],
  [/\bunderscor(?:e|es|ed|ing)\b/g, 'show or indicate'],
  [/\bparamount\b/g, 'necessary; name the consequence'],
  [
    /\bplays? an? (?:vital|crucial|pivotal|key|critical|central|important|significant) role\b/g,
    'say what it does: "X determines Y"'
  ],
  [/\bit is (?:worth|important to) (?:noting|note|mention|mentioning)\b/g, 'cut; state the fact'],
  [/\ba testament to\b/g, 'shows'],
  [/\bharness(?:es|ed|ing)? the (?:power|potential)\b/g, 'use'],
  [/\bunlock(?:s|ed|ing)? the (?:full )?potential\b/g, 'say what it lets X do'],
  [/\bpav(?:e|es|ed|ing) the way\b/g, 'cut, or name the follow-up'],
  [/\bcutting-edge\b|\bgroundbreaking\b|\bgame-chang\w*\b|\brevolutioni[sz]\w*\b/g, 'cut'],
  [/\bnavigat(?:e|es|ing) the\b/g, 'handle'],
  [
    /\bembark\w*\b|\bunveil\w*\b|\belevat(?:e|es|ing)\b|\bempower\w*\b|\bfoster\w*\b|\bbolster\w*\b/g,
    'a plain verb (start, show, raise, allow, strengthen)'
  ],
  [/\bmultifaceted\b|\bholistic(?:ally)?\b|\bnuanced\b/g, 'name the facets'],
  [
    /\bin today's\b|\bin recent years\b|\bwith the rapid (?:development|advancement|growth|progress)\b/g,
    'start with the specific fact and its citation'
  ],
  [
    /\bhas (?:attracted|gained|garnered|received) (?:\w+ )?(?:attention|interest|traction)\b/g,
    'cite the specific works and say what they did'
  ],
  [/\bhas emerged as\b|\bhas become increasingly\b/g, '"is", with the evidence'],
  [/\bsheds? light on\b/g, 'explains or shows'],
  [/\bstreamlin(?:e|es|ed|ing)\b/g, 'simplify; name what is removed'],
  [/\bcommendabl[ey]\b|\bnoteworthy\b/g, 'cut']
]

export const CONNECTIVE_OPENER =
  /^(?:furthermore|moreover|additionally|in addition|notably|importantly|crucially|interestingly|consequently|overall|ultimately|in summary|in conclusion|to this end|as such)\b/
export const CONTINUATION_OPENER =
  /^(?:for example|for instance|specifically|in addition|additionally|also|moreover|furthermore|similarly|likewise|in particular|besides)\b/
export const HEDGES =
  /\b(?:may|might|could|possibly|potentially|perhaps|likely|presumably|arguably|seemingly|suggests?|appears? to|seems? to|to some extent|in principle|tends? to|we hypothesi[sz]e|we conjecture|we speculate|we attribute)\b/g
export const BOOSTERS =
  /\b(?:substantially|dramatically|remarkably|considerably|greatly|vastly|strikingly|drastically|tremendously|massively|extremely|clearly|undoubtedly|impressive(?:ly)?)\b/g
export const VAGUE =
  /\b(?:various|several|numerous|a (?:wide |broad )?(?:range|variety|number) of|diverse|multiple|a plethora of|myriad)\b/g
export const SPECIFIC_AFTER = /\d|\[CIT\]|\[REF|\(|:|\be\.g\.|\bsuch as\b|\bincluding\b|\bnamely\b/i
export const SELF_PRAISE =
  /\b(?:our|this|the proposed) (?:simple|elegant|novel|principled|powerful|effective|efficient|lightweight|flexible|general|intuitive|unified|versatile|scalable|robust)(?:,? (?:yet|and|but) \w+)? (?:method|approach|framework|technique|solution|algorithm|design|model|pipeline|formulation)\b/
export const SIMPLICITY_MEASURE =
  /\blines? of code\b|\bno (?:extra|additional) (?:parameters|hyperparameters|cost)\b|\bone hyperparameter\b|\bsingle hyperparameter\b|\bno retraining\b|\bno fine-tuning\b/
/** Template phrases strong papers avoid. */
export const TEMPLATES =
  /\bin this (?:paper|work),? we (?:propose|present|introduce) (?:a |an )?novel\b|\bin (?:summary|conclusion),|\bthis (?:highlights|underscores|demonstrates|showcases|illustrates) (?:the|our|its) (?:importance|effectiveness|potential|efficacy|versatility|superiority|value)\b/g
/** Template phrases strong papers also use now and then: worth a look, not a warning. */
export const WEAK_TEMPLATES =
  /\bnot only\b.{0,80}\bbut also\b|\b(?:a|an) (?:wide|broad) (?:range|array|variety|spectrum) of\b/g
export const BEST_KNOWLEDGE = /\bto the best of our knowledge\b/
export const SIGNPOST =
  /\bin this section,? we\b|\bas (?:mentioned|discussed|described|noted|stated) (?:above|earlier|before|previously)\b|\bwe now (?:describe|present|turn|discuss)\b|\bin the following,? we\b|\bthe rest of this section\b/g
export const SUPERLATIVE =
  /\bstate[- ]of[- ]the[- ]art\b|\bsota\b|\boutperform(?:s|ed|ing)?\b|\bsurpass(?:es|ed|ing)?\b|\bbest(?: results?| performance| accuracy)\b|\bnew record\b|\b(?:is|are|was|were|be) the first\b|\bthe first (?:to|method|approach|work|paper|system|model|framework|attempt|study)\b|\bunprecedented\b|\bsuperior\b/
/** What turns a superlative into a scoped claim (besides a number, a ref or a citation). */
export const SUPERLATIVE_SCOPE =
  /\bamong\b|\bthat we (?:know of|are aware of|(?:have )?tested|evaluate|consider|compare)|\bto our knowledge\b|\bacross \w+ (?:tasks|benchmarks|datasets|models|settings)\b|\bin (?:our|all our|these|this) (?:experiments|setting|settings|comparisons?)\b/
/** A capitalised benchmark or model name after "on"/"for", e.g. "on ImageNet". */
export const NAMED_SCOPE = /\b(?:on|for|with) (?:the )?[A-Z][\w-]*[A-Z0-9][\w-]*/
export const UNIVERSAL =
  /\b(?:always|never|guarantees?|guaranteed|completely|entirely|perfectly|solves?|eliminates?|any (?:task|model|setting|domain)s?|all (?:tasks|models|settings|domains)|infinite(?:ly)?|unbounded|arbitrar(?:y|ily) long)\b/
export const UNIVERSAL_BACKING =
  /\[REF:(?:thm|theorem|prop|lem|lemma|eq|cor)|\bby (?:construction|definition)\b|\bproof\b|\btheorem\b|\blemma\b/i
export const AGGREGATE =
  /\b(?:on average|up to|consistently|average (?:improvement|gain|speedup|reduction)|mean (?:improvement|gain))\b/
export const AGGREGATE_SCOPE =
  /\[REF|\bacross \w+|\bover \d|\bon (?:all |\d|[A-Z])|\bamong\b|\bcompared (?:to|with)\b|\bthan\b|\bversus\b|\bvs\.|\bfor \d|\bin \d/
export const STATS =
  /p\s*[<=]|confidence interval|\bci\b|\bstd\b|standard (?:deviation|error)|±|\\pm|\bseeds?\b|t-test|wilcoxon|bootstrap|statistically/
export const RESTATE_END =
  /^(?:this|these|overall|thus|together|in summary|in short|as a result|consequently|hence|taken together|in this way|by doing so)\b.{0,120}\b(?:ensur\w+|enabl\w+|allow\w*|mak(?:e|es|ing)|demonstrat\w+|highlight\w*|show\w*|underscor\w+|provid\w+|lead\w* to|result\w* in|guarantee\w*|preserv\w+|keep\w*|retain\w*)\b/
export const PASSIVE =
  /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|built|chosen|done|drawn|given|known|made|seen|shown|taken|written|found|set|kept|held|run|put|split|cast|fed|led|left|read|sent|spent|understood|begun|broken|frozen|hidden|proven)\b/i
export const WE = /\b(?:we|our|us|ours)\b/g
export const WE_PAST = /\bwe (?:\w+ed|ran|took|chose|found|made|built|used|saw|wrote|set)\b/g
export const WE_ANY = /\bwe \w+/g

/** snake_case outside math and \texttt. */
export const CODE_SNAKE = /(?<![\\\w])[a-z][a-z0-9]*_[a-z0-9_]+\b/g
/** camelCase with a lower-case run of 2+ letters, e.g. numHeads; vLLM and mBERT are names. */
export const CODE_CAMEL = /(?<![\\\w])(?:[a-z]{2,}[A-Z][a-z]\w*|[a-z]+[A-Z][a-z]+[A-Z]\w*)\b/g
export const CAMEL_NAMES =
  /^(?:arXiv|iPhone|iPad|eBay|macOS|iOS|watchOS|tvOS|youTube|gitHub|fastText|sentencePiece|wordPiece|pyTorch)$/
/** Framework calls and code nouns; bare "forward pass" is prose, `forward()` is code. */
export const CODE_API =
  /\b(?:torch|nn|np|numpy|jax|jnp|tf|F|cv2|sklearn|scipy)\.[A-Za-z_]+|\b(?:kwargs|args|dtype|cuda\(\)|\.cuda|hooks?\b(?= (?:on|that|which|to|registered))|forward\(\)|__init__|self\.\w+)|\b\w+\.py\b|\b(?:hparams|argparse|state_dict|requires_grad|no_grad|detach\(\))/g
export const CODE_OPTIONS =
  /\bwe (?:additionally|also) support\b|^optionally,|\b(?:the|our) implementation (?:also )?supports\b|\bis also available\b|\bcan (?:optionally )?be (?:enabled|disabled|toggled|switched)\b|\bby default\b|\ba (?:command-line |boolean )?flag\b|\bwhen enabled\b|\bwhen the \w+ (?:flag|option) is set\b/
export const CODE_NARRATION =
  /\b(?:implementation|helper|routine|wrapper|utility|evaluator|supplied|invoked|invokes|argument|arguments|codebase|function call|the function|the class)\b/g

export const PRIOR_WORK_CUE =
  /\b(?:existing|prior|previous|earlier|recent|current|conventional|standard|traditional|popular|mainstream|competing|alternative) (?:work|works|methods?|approaches|techniques|systems|models|algorithms|literature|studies|research|pipelines|baselines|solutions|frameworks)\b|\bmost (?:methods|approaches|work|systems)\b|\bhas been (?:shown|proposed|studied|explored)\b|\b(?:were|was|have been) proposed\b|\bpioneer\w*\b|\bstate[- ]of[- ]the[- ]art (?:methods|approaches|systems|models)\b|\b[\w-]+-based (?:methods|approaches|techniques|systems)\b|\b(?:widely|commonly) used\b|\b(?:the|a) (?:standard|common|popular|typical|usual|dominant) (?:approach|practice|recipe|method|paradigm|pipeline)\b|\b(?:methods|approaches|techniques) (?:such as|like)\b/
/** Engineering detail that belongs in the appendix or the code release, not the method. */
export const CODE_DETAIL =
  /\b(?:(?:zero|left|right)-?pad\w*|pad(?:s|ded|ding)\b|dtype|b?float16|bf16|fp16|fp32|half[- ]precision|mixed[- ]precision|gpu memory|batch dimension|along the (?:batch|sequence|channel) (?:dimension|axis)|reshap\w+|contiguous|in-place|monkey-?patch\w*|(?:forward |backward )?hooks?\b|ignore[- ]index|(?:initiali[sz]ed|initiali[sz]e) (?:with|from|using)|xavier|kaiming|glorot|random seed|seeds? (?:of|to|=)|numerical(?:ly)? stab\w+|clamp\w*|by default|defaults? to|configurable|can be configured|configured (?:with|as|to)|constructor|keyword argument|command[- ]line)\b/
export const ABBREVIATIONS =
  /\b(?:e\.g|i\.e|et al|Fig|Figs|Eq|Eqs|Sec|Secs|Tab|Tabs|Ref|vs|cf|etc|resp|approx|Alg|Thm|App|No|w\.r\.t|a\.k\.a|Appx|Def|Prop|Lem|Cor)\./g

/**
 * A claim swept over the whole evaluation ("all baselines", "every task") without saying how many
 * there were. Naive drafts in the writing bench did this 6x as often as the published text.
 */
export const SWEEP =
  /\b(?:every|all)\s+(?:of\s+the\s+)?(?:(?:other|evaluated|tested|considered|prior|existing|competing)\s+)?(?:baselines?|methods|approaches|tasks?|subtasks?|settings?|models?|benchmarks?|datasets?|sizes?|scales?|configurations?|environments?|languages?|domains?|metrics?)\b/
export const SWEEP_COUNT =
  /\b(?:every|all|each)\s+(?:of\s+the\s+)?(?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|both)\b/
/** What makes a sweep a claim rather than a setup ("we train all models for 10 epochs"). */
export const CLAIM_VERB =
  /\b(?:outperform\w*|beat\w*|better|best|improv\w*|exceed\w*|surpass\w*|higher|lower|faster|wins?|fails?|succeed\w*|achiev\w*|matches|holds?|generali[sz]\w*|robust\w*|consistent\w*)\b/
/** Markdown that leaked into LaTeX: bold, inline code, bullets and headings. */
export const MARKDOWN = [
  [/\*\*[^*\n]{1,80}\*\*/, 'markdown bold'],
  [/(?:^|[\s(])`[^`'\n]{1,60}`(?=[\s.,;:)]|$)/, 'markdown inline code'],
  [/^\s*[-*•]\s+[A-Za-z][^\\$&]*$/, 'a markdown bullet'],
  [/^\s*#{1,6}\s+[A-Z][^\\$&]*$/, 'a markdown heading']
]
/** A short bold or italic run-in label opening a paragraph: \textbf{Setup.} or \emph{Key idea:}. */
export const RUN_IN_LABEL =
  /^\s*\\(?:textbf|textit|emph|underline|textsc)\{([^{}]{1,60})\}\s*([.:])?/
