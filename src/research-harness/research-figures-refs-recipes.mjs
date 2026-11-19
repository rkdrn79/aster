// Style recipes of reference figures in generative models, architectures, systems and robotics.
// Our own text recipes of published figures (composition and glyph vocabulary, no images and no
// copied captions); the images stay in the user-local reference folder (research-figures-refs.mjs).

export const RECIPES_OTHER = [
  {
    id: 'score-sde',
    title: 'Score-Based Generative Modeling through Stochastic Differential Equations',
    arxiv: '2011.13456',
    year: 2021,
    figure: 'Fig. 2',
    aliases: ['Score SDE', 'score-based SDE', 'forward and reverse SDE', 'diffusion SDE'],
    genre: 'generative',
    kinds: ['data-plot-as-diagram', 'method-overview', 'comparison'],
    keywords: [
      'diffusion',
      'forward process',
      'reverse process',
      'probability density',
      'trajectory',
      'sde',
      'noise to data',
      'marginal distribution',
      'heat map',
      'symmetric layout'
    ],
    summary:
      'A single wide strip of two viridis density heat maps back to back with thin edge marginals; jagged red-to-purple sample paths and smooth white curves run across both halves, with an equation above each arrow and a tidy black arrow row below.',
    layout:
      'Top row of circled endpoints, black lines and equations (data, forward SDE, prior, reverse SDE, data); middle band of five white-framed blocks: marginal, heat map, marginal, heat map, marginal; bottom row of long black arrows with p_t(x) in the gaps. Story: left-to-right. Proportions: 2.95:1 (1747x593). Edge marginal 5%, forward heat map 40%, prior marginal 5%, reverse heat map 40%, edge marginal 5%; the band uses 70% of the height, header 22%, arrow row 8%.',
    glyphs: [
      'density heat map: viridis fill (#440154 to teal to #fde725) with the density widening to a yellow-green ridge in the middle of the band, no axes or ticks, sharp rectangular border → fig.density',
      'stochastic sample paths: about 8 jagged 2px lines per half in crimson, salmon, orange and dark plum, starting at the left edge, wandering widely and ending near the right → fig.trajectories',
      'smooth ODE curves: thick white 2px curves running as a symmetric pair that bows slightly, clearly smoother than the paths → fig.flow',
      'edge marginal: tall white box with a black 2px border; a vertical density curve inside coloured by the viridis ramp; the curve is bimodal at the data ends and one smooth bump at the prior → fig.plot',
      'endpoint circles: circle with 1.5px black outline around x(0) or x(T), the line enters on the left and leaves on the right → fig.node',
      'equation arrows: thick black horizontal line with a filled head, broken in the middle for a TeX equation at the same height → fig.arrow + fig.math'
    ],
    colour: [
      'viridis (purple #440154, teal #21908d, yellow #fde725): probability density; yellow is high',
      'crimson to plum (#e02f46, #fbb4a0, #3b0f4f): individual stochastic paths',
      'white: the deterministic ODE curves',
      'neutrals: Black for the arrows, frames and circles; black serif math; white page.'
    ],
    emphasis:
      'The strip is a continuous colour field across the whole width; the white curves are the quiet main object, the jagged paths carry the visual noise and the endpoint marginals frame the ends.',
    type: 'sans (Arial look) for the words Data, Forward SDE, Prior; serif italic LaTeX math for equations and p_t(x); 3 sizes: heading words (~26px), equations (~28px), arrow-row labels p_t(x) (~28px). Heading words sit directly above their arrows; a rotated x label stands alone at the far left.',
    handmade: [
      'the jagged paths are drawn as real noisy lines',
      'two halves mirror each other left-right',
      'tiny marginal curves anchor both ends',
      'the arrow breaks to hold its own equation',
      'legend box is translucent over the data'
    ],
    avoid:
      'Do not copy the exact SDE equations or the two-mode data distribution; keep the single colour field with paths over it.'
  },
  {
    id: 'var',
    title: 'Visual Autoregressive Modeling: Scalable Image Generation via Next-Scale Prediction',
    arxiv: '2404.02905',
    year: 2024,
    figure: 'Fig. 2',
    aliases: ['VAR', 'visual autoregressive', 'next-scale prediction', 'autoregressive comparison'],
    genre: 'generative',
    kinds: ['comparison', '3d-scene', 'method-overview'],
    keywords: [
      'token',
      'autoregressive',
      'multi-scale',
      'resolution',
      'next-scale',
      'pedestal',
      'patch grid',
      'staircase',
      'progressive refinement',
      'three-way comparison'
    ],
    summary:
      'Three tilted 3D slabs (orange, green, blue) carry three autoregressive schemes: word cards, image-patch cubes and, on the right, a staircase of translucent panels that sharpen a pixelated parrot from r1 to rK; captions run along the slab edges at the same tilt.',
    layout:
      'A centred italic serif title at the top; stacked on the left an orange slab with word cards (a) over a green slab with patch cubes and a 3x3 reshape grid (b); on the right one big pale-blue slab with the growing panels (c); each slab has its caption under it, tilted like the slab. Story: left-to-right. Proportions: 2.9:1 (2309x803). Left column (a) and (b) 44% wide, (c) 50% wide; (a) uses the top 45% of the left, (b) the lower 40%; the title floats in the top-centre gap.',
    glyphs: [
      'pedestal slab: a long thin box in oblique view with a light fill (orange #fbe5c8, green #dcebd0, blue #dbe6f6), a darker edge line, a slight clockwise tilt; the slab name is printed bold on its front face along the tilt → fig.tokenMaps (pedestal) or fig.stack',
      'word cards: white-grey 3D cards standing on the slab, each with a word and a pale grey x_i tag above it; dotted arrow lines run along both sides ending in an ellipsis → fig.tokens',
      'image patch cubes: small cubes holding crops of the same photo, labelled x_1 to x_9 in bold dark sans over the crop; a green block arrow reshape leads to a dashed-border 3x3 grid with large bold numbers → fig.tokenMaps or b.patchGrid',
      'scale panels: five upright translucent panels standing in a staircase from tiny r1 to big rK (heights growing about 1.7x each step); the photo is pixelated more at small r, rK full resolution; a grey-blue funnel behind them → fig.tokenMaps',
      "dotted flow lines: black dotted lines with small open heads from the first panel corner to the last panel corner and from slab ends, with 'ellipsis' dots → fig.polyline (dotted)",
      'bold-and-plain captions: label (a)/(b)/(c) bold, then plain caption with one bold phrase such as next-token, all rotated with the slab → fig.subcaption'
    ],
    colour: [
      'orange slab (#fbe5c8, edge #d9b887): text autoregression',
      'green slab (#dcebd0, edge #a9c78f): image-token autoregression',
      'light blue (#dbe6f6, panels #b7cde8): the proposed multi-scale scheme',
      'neutrals: Black bold sans captions and dotted lines; white and grey cards; the photo carries all saturated colour.'
    ],
    emphasis:
      'The blue staircase is the largest object, about 50% of the width, and the photo reaches full resolution at its end; the two left slabs are smaller and flatter so the eye lands on the right.',
    type: 'bold italic serif for the title; bold sans for panel letters and names; regular sans for captions; 4 sizes: title (~44px), slab names (~30px bold), captions (~30px with a bold keyword), tiny x_i and r_i tags (~24px). All slab text is rotated with its slab; the title is not rotated.',
    handmade: [
      'labels tilted to match each slab',
      'the same photo reused at every scale',
      'numbered 3x3 tiles with dashed outer border',
      'dotted arrow lines hugging the slab edges',
      'pale ghost tags above word cards'
    ],
    avoid:
      'Do not copy the parrot, the GPT/LLaMA/iGPT names or the italic title wording; keep the same-photo progressive resolution idea.'
  },
  {
    id: 'make-a-video',
    title: 'Make-A-Video: Text-to-Video Generation without Text-Video Data',
    arxiv: '2209.14792',
    year: 2022,
    figure: 'Fig. 2',
    aliases: [
      'Make-A-Video',
      'text-to-video',
      'video diffusion pipeline',
      'cascade of video models'
    ],
    genre: 'generative',
    kinds: ['pipeline', '3d-scene', 'method-overview'],
    keywords: [
      'video',
      'frames',
      'filmstrip',
      'cascade',
      'temporal',
      'super-resolution',
      'noise frame',
      'pipeline stages',
      'interpolation',
      'text prompt'
    ],
    summary:
      'Video clips are drawn as long 3D filmstrip boxes stacked in a diagonal, each stage a different outline colour, with the same yoga scene getting sharper and longer toward the front, plus a tilted paper card for the input text and short coloured arrows lying along each strip.',
    layout:
      'Tilted white text card at lower left, a small red translucent bar for the prior with a tiny fps card beside it, then elbow lines rising to each stage; stages are stacked from back-top (decoder) through frame interpolation and super-resolution to the big generated video in the lower right, each with a coloured italic name above it. Story: diagonal. Proportions: 2.6:1 (2400x930). Text card and prior 22% on the left; the stages occupy 70% on a diagonal; the generated-video strip spans 55% of the width and 35% of the height at the bottom right.',
    glyphs: [
      'filmstrip box: an open box with 3 to 12 photo frames in a row, black thin outline for the final video and a 2px coloured outline per stage (blue, green, purple); all strips run along the same rising axis; each is longer than the stage before it → fig.filmstrip',
      'noisy and masked frames: frames at one end are grainy noise or solid black (frames to be filled), the other end is clean; a grey noise card with the words Fixed Noise stands at the strip end → fig.filmstrip (noise frames)',
      'ellipsis dots: three small 3D dots in the stage colour at the ends of each strip, bigger black ones at the generated strip → fig.filmstrip',
      'in-plane arrows: short fat arrows in the stage colour lying along the frame row, pointing in the direction of time → fig.arrow',
      'prior block: red translucent 3D bar (#e02020 at about 60%), a red arrow enters from the text card, red and black elbow lines leave toward every stage with arrowheads pointing up → fig.tensor + fig.arrow (elbow)',
      'text card: white tilted paper with black outline and serif italic quote lines slanted to match → fig.box (rotated)'
    ],
    colour: [
      'blue (#1f5fe0): spatiotemporal decoder stage',
      'dark green (#3a5f2a): frame interpolation stage',
      'purple (#7b3fb8): spatiotemporal super-resolution stage',
      'red (#e02020): prior and input text path',
      "neutrals: Black for the final outputs, fps card, elbow lines and the last stage's labels; warm photo colours carry the rest."
    ],
    emphasis:
      'The final generated strip is largest, lowest and nearest, drawn with a heavy black outline; the same subject at every stage lets the eye follow resolution rising along the diagonal.',
    type: 'serif italic throughout; big upright serif math symbols for the model letters; 4 sizes: stage names (~24px italic, stage colour), model letters D^t, F, SR (~50px, same colour), Input Text and Generated Video (~44px), tiny Prior/fps labels (~28px). Each stage name and its letter share one colour; Input Text and Generated Video are black and large.',
    handmade: [
      'short arrows lying along each frame row',
      'noise and black frames mixed in with clean frames',
      'tilted paper card with slanted text',
      'elbow lines rising to each stage like a wiring harness',
      'stage names tinted to match their outline'
    ],
    avoid:
      'Do not copy the yoga photo, the Fixed Noise wording or the decoder/interpolation/SR names; keep the diagonal stacking of strips and one colour per stage.'
  },
  {
    id: 'mamba',
    title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',
    arxiv: '2312.00752',
    year: 2023,
    figure: 'Fig. 1',
    aliases: ['Mamba', 'selective state space model', 'SSM', 'selection mechanism'],
    genre: 'architecture',
    kinds: ['architecture-block', 'method-overview', 'systems'],
    keywords: [
      'state space',
      'recurrent state',
      'rails',
      'lanes',
      'input-dependent',
      'selection',
      'gate',
      'memory hierarchy',
      'sram',
      'sequence model'
    ],
    summary:
      'Four long orange rails run edge to edge through a green column, with green input columns feeding them at right angles through rounded elbow lines and blue thick arrows fanning out from a small Project box; a tiny memory pyramid in the corner says where it runs.',
    layout:
      'Centred bold title with an italic subtitle; a top band of four orange rails from a stacked h_{t-1} on the left to a stacked h_t on the right with a tall green A column in the middle; a lower band with the x_t strip, B_t column, Project box, Delta_t square, C_t column and y_t strip, all connected to the rails by elbow lines; a two-tier pyramid in the bottom-right corner. Story: left-to-right. Proportions: 2.65:1 (2400x901). Title block top 14%, rail band 14% to 50%, input and output band 50% to 100%; h_{t-1} stack 7% of width at the left, rails 85%, pyramid 11% at the right bottom.',
    glyphs: [
      'state lanes: four parallel thin orange lines (about 2.5px, #d1580e) through the full width, small open heads on the dashed inbound stubs, one dashed stub per lane at each end; they pass behind the green A column → fig.rails',
      "stacked state block: four offset peach rectangles (#fbe2d4 fill, orange outline) fanned up-left behind the front one, so it reads as a bundle → fig.planes({ count: 4, facing: 'front', ramp: false }) (a stack of state copies)",
      'vector columns: tall green rectangles (#e3efd9 fill, 3px #4f7f2f outline); input and output vectors are the same colour but drawn as five stacked cells → fig.tensor',
      'elbow wires: orange lines leave the green B and C columns, bend with rounded 90 degree corners and join the lanes; lines on the right of A go to C in a staggered ladder → fig.arrow (elbow)',
      'selection mechanism: a small light-blue box labelled Project with a blue outline; three thick blue (#2b6fb5) elbow arrows with filled heads fan out to B, Delta and C; a bold blue label underneath; blue dashed lines from the x_t strip to the box → fig.box + fig.arrow (elbow)',
      'memory pyramid: a black-outlined triangle split into an orange tip (GPU SRAM) and a green base (GPU HBM), white bold labels inside → fig.pyramid'
    ],
    colour: [
      'orange (#d1580e, fills #f08030): hidden state path and fast memory (SRAM)',
      'green (#4f7f2f, fill #e3efd9): inputs, outputs and parameters (B, C, A, x, y); also the slow memory tier',
      'blue (#2b6fb5): the selection mechanism that makes parameters input-dependent',
      'neutrals: Black dashed lines for discretisation, black text; white page; no panel box around anything.'
    ],
    emphasis:
      'The four orange rails across the top are the longest, most repeated object, so the state is the star; the blue arrows are the only thick strokes and point out what is new.',
    type: 'bold humanist sans for the title, italic sans subtitle, serif italic LaTeX math for symbols; 4 sizes: title (~48px bold), subtitle (~34px italic), math symbols (~40px), tiny labels Discretize / Project (~22px bold). Symbols sit just outside their column, not inside; the blue label Selection Mechanism is bold and blue.',
    handmade: [
      'dashed lane stubs entering from the page edge',
      'staggered ladder of elbow lines with rounded corners',
      'bundle of offset rectangles for the state stack',
      'colour language held through every glyph',
      'pyramid used as a key instead of a full memory diagram'
    ],
    avoid:
      'Do not copy the B, C, A, Delta symbols, the Project box wording or the exact elbow routing; keep the long parallel lanes, the colour-per-role rule and a small key glyph.'
  },
  {
    id: 'flashattention',
    title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness',
    arxiv: '2205.14135',
    year: 2022,
    figure: 'Fig. 1',
    aliases: ['FlashAttention', 'flash attention', 'IO-aware attention', 'tiling'],
    genre: 'architecture',
    kinds: ['systems', 'multi-panel-claim', 'data-plot-as-diagram', 'method-overview'],
    keywords: [
      'memory hierarchy',
      'tiling',
      'loop',
      'block matrix',
      'copy to fast memory',
      'bandwidth',
      'bar chart',
      'gpu',
      'cache',
      'speedup'
    ],
    summary:
      'A memory pyramid with tier-coloured notes, a block-matrix diagram where small orange squares are copied from long green strips into fast memory, and a stacked bar chart after a vertical divider; orange means fast memory in all three.',
    layout:
      'A black-outlined three-tier pyramid with notes at the right and a two-line caption below; in the middle four green cell strips around a dashed square matrix, orange copy blocks, red outer-loop and blue inner-loop arrows and a bold name below; a thin vertical black rule; a titled bar chart with brackets at the far right. Story: left-to-right. Proportions: 2.55:1 (1799x703). Pyramid and notes 32%, matrix diagram 38%, vertical rule at 72%, bar chart 27%.',
    glyphs: [
      'memory pyramid: a broad triangle with a thick black outline, split into three horizontal tiers: orange tip, green middle, teal base; white bold labels inside; tier notes at the right, the tier name coloured like the tier and the numbers in black → fig.pyramid',
      'cell strip: a row or column of 8 equal green (#3f9a3a) cells with 2px dark outlines; one each for K, Q, V and the output; the size label like N x d in small italic sits beside the strip → fig.tiledMatrix',
      'copied block: small orange (#f5821f) square with black 2px outline standing off the strip, linked by a short black arrow; another one shown inside the matrix as the compute block → fig.tiledMatrix',
      'dashed attention matrix: a square with a black 1.5px dashed outline and two dashed vertical bars marking a tile; label QK^T rotated 90 degrees on the left → fig.tiledMatrix',
      'loop arrows: long red (#e8334a) and blue (#4c76b8) arrows along the strips labelled Outer Loop and Inner Loop in the same colour; the vertical labels are rotated 90 degrees → fig.tiledMatrix (loop arrows)',
      'stacked bar chart: two blue (#4a76ae) bars with black dividers between operations, a tall one and a short one, L-shaped black axes with 0, 5, 10, 15 ticks, black brackets labelling each segment → fig.plot + fig.brace'
    ],
    colour: [
      'orange (#f5821f): fast on-chip memory: the pyramid tip, the copied blocks, the keyword SRAM',
      'green (#4aa53b): slower big memory and the big matrices',
      'teal (#6fbfaa): the slowest, largest tier',
      'red and blue (#e8334a, #4c76b8): outer loop and inner loop directions',
      'purple (#b05fb0): compute flow',
      'neutrals: Black outlines and axes, black bold titles; white page; a thin vertical black rule separates the diagram from the chart.'
    ],
    emphasis:
      "The orange square is repeated in the pyramid, the matrix and the compute block, so the eye follows 'fast memory'; the short fused bar at the far right is the visual payoff.",
    type: 'bold humanist sans (Myriad look); coloured keywords inside black text; italic for matrix sizes; 4 sizes: panel titles (~34px bold), tier labels in the pyramid (~34px bold white), notes and loop labels (~26px), tiny size labels N x d (~22px italic). Words such as SRAM and HBM are coloured by tier inside a black sentence; Inner/Outer Loop labels are rotated to follow the arrow.',
    handmade: [
      'coloured words inside black sentences',
      'rotated loop labels along the arrows',
      'one orange square copied and moved with tiny arrows',
      'dashed tile outline over the matrix',
      'brackets hand-placed beside bar segments'
    ],
    avoid:
      'Do not copy the GPT-2 bars, the TB/s numbers or the exact outer/inner loop assignment; keep the pyramid plus tiling plus chart triple under one colour rule.'
  },
  {
    id: 's4',
    title: 'Efficiently Modeling Long Sequences with Structured State Spaces (S4)',
    arxiv: '2111.00396',
    year: 2021,
    figure: 'Fig. 1',
    aliases: ['S4', 'structured state spaces', 'state space layer'],
    genre: 'architecture',
    kinds: ['multi-panel-claim', 'method-overview'],
    keywords: [
      'three panels',
      'claim',
      'state space',
      'long range',
      'equation colour',
      'hand-drawn sketch',
      'discretisation',
      'convolution',
      'matrix',
      'bold titles'
    ],
    summary:
      'Three square-cornered black cards in one row, each with a hand-drawn sketch on top, a colour-coded equation in the middle and a bold two-line title at the bottom; the wavy hand-drawn curves and dots take the stiffness out of the maths.',
    layout:
      'Three black-outlined cards of equal height side by side: continuous state space (block diagram, wavy arrow, equation), long-range dependencies (curve with a dashed red arc, matrix), fast discrete representations (box chain, sampled curve, impulse bumps, two equations). Story: left-to-right. Proportions: 3.1:1 (1815x583). Card 1 25%, card 2 25%, card 3 44%, gaps about 2% each; sketch zone is the top 40% of each card, equation the middle 30%, bold title the bottom 25%.',
    glyphs: [
      'outlined card: rectangle with a 3px black outline and square corners, white fill, 18px outer gap to the next card → fig.panel',
      'block diagram: thin 1.5px black line with three small squares labelled u, x, y and a feedback loop box A in red below; open arrowhead at the right end → fig.box + fig.arrow (elbow)',
      "hand-drawn curve: one thick 4px black wavy stroke with a swoop, ending in an open 'V' arrowhead in one card and a bare end in another → hand: fig.curve",
      'dashed red arc: a thin dashed red curve underneath the black wave with an open arrowhead pointing back to the start, meaning a long-range link → fig.curve (dashed)',
      'small matrix: a 3x3 TeX matrix with a lower-triangular pattern of integers, A in red italic as its name → fig.matrix',
      'sampled curve and bumps: a light-grey wavy curve with black dots at regular samples; to the right overlapping black-to-light-grey impulse bumps on one axis arrow → fig.curve + hand: fig.polyline'
    ],
    colour: [
      'red (#c00000): continuous-time parameters A, B, C, D and the long-range link',
      'blue (#2e86d0): the discretised parameters with bars over the letters',
      'green (#5a9a2a): the convolution kernel',
      'neutrals: Black for card borders, sketches and bold titles; grey for the sampled curve and fading impulses; white page.'
    ],
    emphasis:
      'The bold two-line titles at the bottom of each card are the loudest text; card size grows with the amount of content, so the widest card is the third.',
    type: 'bold condensed humanist sans for titles, serif italic LaTeX math for equations; 3 sizes: card titles (~52px bold), equations (~44px), tiny block-diagram letters (~30px). Colour is on letters inside equations (A, B, C in red; barred symbols in blue; K in green); titles stay black.',
    handmade: [
      'wobbly thick strokes in the sketches',
      'dashed red arc under the curve',
      'grey-to-black fading bumps',
      'dots sampled along a grey curve',
      'three same-height cards with generous white space'
    ],
    avoid:
      'Do not copy the A, B, C, D matrices, the 3x3 matrix numbers or the exact titles; keep three equal-height cards of sketch + equation + bold title with colour-coded symbols.'
  },
  {
    id: 'densenet',
    title: 'Densely Connected Convolutional Networks',
    arxiv: '1608.06993',
    year: 2017,
    figure: 'Fig. 1',
    aliases: ['DenseNet', 'dense block', 'dense connections', 'skip connections'],
    genre: 'architecture',
    kinds: ['architecture-block', '3d-scene', 'pipeline'],
    keywords: [
      'skip connection',
      'dense connection',
      'feature maps',
      'layers',
      'diagonal flow',
      'stack of planes',
      'concatenation',
      'residual',
      'depth',
      'colour by source'
    ],
    summary:
      'Five stacks of tilted translucent sheets, each stack a different colour that fades from dark at the back to pale at the front, step down a diagonal; long thin curved arrows coloured by their source stack sweep under the diagram to every later stack.',
    layout:
      'A stack of dark-red sheets labelled Input and x0 at the top-left, then a white slanted BN-ReLU-Conv label with H_1 above, a green stack x1, then purple x2, gold x3, orange x4, and a slanted Transition Layer label with a grey arrow at the bottom right; the arcs hang beneath the diagonal. Story: diagonal. Proportions: 1.4:1 (1750x1260). Each stack about 17% of width by 25% of height; the diagonal steps about 19% right and 17% down per layer; the arcs occupy the lower-left 40% of the canvas.',
    glyphs: [
      'feature-map sheets: four to six upright parallelograms offset up-left behind the front sheet, 1.5px black outline each, fill ramps dark at the back to pale at the front; the front sheet is nearly white-tinted → fig.planes',
      'layer-op label: a white slanted rectangle (rotated about -25 degrees to the depth axis) with a black thin outline and italic sans text BN-ReLU-Conv, with a coloured short stub joining it to the next stack → fig.box (rotated)',
      'skip arcs: thin 2px smooth curves leaving a dot on the front sheet of one stack and swooping down and right to every later label box, ending in small solid arrowheads; a red set from the first stack, a green set from the second, purple from the third, gold from the fourth → fig.skipArcs',
      'stack colour ramps: red (#8b0a14 to #f7c6c8), green (#4a8a6a to #e0ece6), purple (#7a4a7a to #e8dcec), gold (#b8901a to #f9eecf), orange (#b0480e to #fbe0d2) → fig.planes',
      'layer labels: italic serif H_k above each label box; bold upright x_k beside each stack; the word Input rotated along the sheets → fig.math',
      'output arrow: a grey solid arrow leaving the transition layer box toward the lower right → fig.arrow'
    ],
    colour: [
      'red (#e61b1b arcs, #f7c6c8 sheets): layer x0 and every connection coming from it',
      'green (#00b050 arcs): layer x1 and its connections',
      'purple (#9a5aa8 arcs): layer x2 and its connections',
      'yellow-gold (#ffc000 arcs): layer x3 and its connections',
      "dark red-brown (#7b0f0f): layer x4's single output arrow",
      'neutrals: Black thin outlines on all sheets and label boxes; white fills for label boxes; pure white page.'
    ],
    emphasis:
      "The many long coloured arcs fill the lower-left and are the figure's point; colour tells which layer each came from, and the diagonal stacks are muted so the arcs read first.",
    type: 'italic sans for the operation labels, serif italic for H_k, bold serif for x_k; 3 sizes: operation labels (~34px italic), H_k and x_k (~30px), Input and Transition Layer (~34px). Every operation label is rotated to follow the depth axis; subscripts are small.',
    handmade: [
      "each arc takes its source stack's colour",
      'sheets get lighter toward the viewer, like a transparent stack',
      'arcs start from a dot on the sheet and sweep in a single smooth curve',
      'label boxes rotated along the diagonal',
      'arrowheads are tiny filled triangles'
    ],
    avoid:
      'Do not copy the exact H_1 to H_4 depth, the BN-ReLU-Conv text or the five-colour palette; keep colour-by-source arcs under a diagonal stack.'
  },
  {
    id: 'rt-2',
    title: 'RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control',
    arxiv: '2307.15818',
    year: 2023,
    figure: 'Fig. 1',
    aliases: ['RT-2', 'vision-language-action', 'VLA', 'robot policy tokens'],
    genre: 'embodied',
    kinds: ['method-overview', 'pipeline', 'multi-panel-claim'],
    keywords: [
      'token',
      'tokens pill',
      'modality colour',
      'framed region',
      'vision language',
      'action output',
      'photo grid',
      'three stage',
      'de-tokenize',
      'co-fine-tune'
    ],
    summary:
      'Three rounded frames with titles cut into their borders read data, model, deployment; inside, small pill-shaped tokens colour-coded by modality pass through a grey box into purple action tokens, with real photos on the left and right.',
    layout:
      'Left frame of three white cards each pairing a photo with a question in grey-ghosted text and a lavender answer; middle frame holding input tokens, an image grid with ViT, an orange container with token pills, then a purple output chain; right frame of three captioned photos; two grey elbow arrows below link the frames. Story: left-to-right. Proportions: 2.7:1 (2400x885). Data frame 34%, model frame 47%, closed-loop frame 16%, gaps about 1.5%; the Co-Fine-Tune and Deploy arrows sit under the frames in a band of 10% height.',
    glyphs: [
      'notched frame: rounded rectangle (about 20px radius) with a 2px light-grey border; the title text sits on the top edge, with the border broken around it → fig.panel',
      'data card: white rounded card with a faint shadow, a photo on one side (alternating left and right) and Q text beside it; the A text is light grey (ghost) and the answer is in a lavender (#d9d0ee) box with a purple 2px outline → fig.box + fig.image',
      'token pills: rounded ovals of one size in rows; orange outline for text input, blue-filled for image tokens, light grey for empty slots, purple outline for action outputs; short orange down-arrows feed the container → fig.pills',
      'model container: light peach (#fdeedd) rounded box labelled in orange bold; inside it a long thin orange rounded bar (the transformer); inside the grey (#f2f2f2) outer box the title RT-2 is bold grey → fig.box',
      'vision encoder: light-blue (#cfe0f8) rounded square with a bold blue ViT; a 3x3 photo grid with thin white gaps sits to its left → fig.box + fig.image',
      'output brace and elbow: a purple brace under the last three output pills, a purple 2px elbow line down and left to a purple-outlined box with a tokens string, then an arrow labelled De-Tokenize to a box with action values → fig.brace + fig.arrow (elbow)'
    ],
    colour: [
      'orange (#f5a623): text and task input tokens and the LLM container',
      'blue (#4a7bd8): image tokens and the vision encoder',
      'purple (#5b3fa8): action tokens, answers and the final robot action',
      'light grey (#cfcfcf): empty slots and ghosted question-answer text',
      'neutrals: Dark grey (#333) for body text; mid grey for frame titles and borders; white card fills; pale grey (#f2f2f2) for the model box.'
    ],
    emphasis:
      'Purple is used only for action; its answers and output tokens are darkest, and the ghosted grey question text recedes, so the eye follows purple from left to right.',
    type: 'one geometric sans (Avenir look) throughout, regular weight, bold only for RT-2, ViT and the LLM name; 3 sizes: frame titles (~30px grey), body Q/A text (~26px), small action strings and arrow labels (~20px). Words such as task are bold orange in a grey sentence; answer text is purple; the A line is ghost grey.',
    handmade: [
      'title notch cut into the border',
      'ghosted grey answer text followed by a purple boxed answer',
      'pill tokens in rows with short arrows',
      "photos reused as the figure's real result",
      'grey elbow arrows run beneath the frames'
    ],
    avoid:
      'Do not copy the donkey/robot photos, the Q and A text or the exact 6/8 pill counts; keep the notched frames and the modality colour scheme.'
  },
  {
    id: 'peract',
    title: 'Perceiver-Actor: A Multi-Task Transformer for Robotic Manipulation',
    arxiv: '2209.05451',
    year: 2022,
    figure: 'Fig. 2',
    aliases: ['PerAct', 'Perceiver-Actor', 'voxel transformer', 'robot manipulation transformer'],
    genre: 'embodied',
    kinds: ['pipeline', 'architecture-block', '3d-scene'],
    keywords: [
      'voxel',
      'workspace',
      'token strip',
      'transformer band',
      'encoder decoder',
      'skip connection',
      'readout',
      'same viewpoint',
      'action prediction',
      '3d input and output'
    ],
    summary:
      'The same voxelised robot workspace is drawn at the same view on the input and on the output, with a single wide green band standing for the transformer between them, strips of small voxel cubes above and below, and little icons for the three Q-value readouts.',
    layout:
      'Left: a pale voxel scene with two wireframe camera icons and a quote under it; middle: a dotted latent box above a wide green gradient band with a thin token line below it, an encoder row below that and voxel-cube strips top and bottom; right: the same voxel scene with a dotted circle, then maxpool and MLP boxes feeding three small Q icons. Story: left-to-right. Proportions: 4.0:1 (1750x438). Input scene 19%, transformer block 45%, output scene 18%, readout icons 14%; the transformer band sits at 40% height, strips of cubes above and below at 10% and 82%.',
    glyphs: [
      'voxel scene: a render of beige floor voxels and grey semi-transparent object voxels viewed from above-right, same viewpoint on input and output; faint translucent grey walls → fig.perspective with b.voxels',
      'camera glyph: wireframe polyhedron drawn with thin black strokes, with an italic label left or right under each → b.camera',
      'transformer band: one long rounded rectangle, a horizontal gradient from deep green (#00a050) to teal (#1bb9b0), white centred label → fig.box',
      'token line: a thin black horizontal line carrying evenly spaced narrow vertical green rectangles (about 20 px wide, dark outline) with up-arrows to the band and down-arrows from the decoder → fig.tokens',
      'voxel cube strips: small dotted-outline cubes in a row with ellipsis between; above the band the cubes are coloured by gradient, below they are beige-grey → fig.tensor',
      'readout icons: an orange maxpool bar branching with elbow lines to three small orange MLP boxes, then red and grey filled dots for the open flag and collide flag, a dotted-grid sphere for rotation, and a big italic Q under each → fig.pills'
    ],
    colour: [
      'green to teal (#00a050 to #1bb9b0): the transformer and its token cubes',
      'light blue and mint (#a3d9ef, #8ed8b0): voxel decoder and language encoder',
      'orange (#f58a1f): maxpool and MLP heads',
      'yellow (#ffd400): the small position-embedding pill',
      'red dot (#e8281e): the selected binary action value',
      'neutrals: Black for the token line, outline of the dotted latent box, and text; the scene is pale beige and grey so the green band stands out.'
    ],
    emphasis:
      'The saturated green band is the only large flat colour and spans nearly half the width; the two pale voxel scenes frame it from either side.',
    type: 'plain sans (Arial look) for labels, italic serif for Q and the quote, italic for left and right; 4 sizes: band label (~30px white), bar labels (~20px), tiny size notes (~16px), big Q (~34px italic). A label sits directly inside every bar; skip connection is rotated 90 degrees along a bracket line.',
    handmade: [
      'same viewpoint on the input and output scene',
      'dotted outlines on cubes and on the latent box',
      'token line with evenly spaced small boxes',
      'bracket line with a rotated label for the skip link',
      'dotted circle marks the chosen voxel'
    ],
    avoid:
      'Do not copy the drawer scene, the PerceiverIO name, the 2048 x 512 numbers or the open/rot/collide icons; keep the same-view input/output and the single band.'
  }
]

/** The rules most of the references share (round 18 style study): the figure's design DNA. */
export const STYLE_DNA = [
  {
    rule: 'Draw the concept, not a box',
    text: "The paper's core object is drawn in its own form (a scene with rays, a cuboid tensor, stacked planes, a voxel grid, a token map, a tiled matrix, a pyramid, a density field) and is the largest thing on the page; plain boxes only for secondary modules (an MLP, an encoder), and small."
  },
  {
    rule: 'One story axis',
    text: 'Three to five stages read left to right (or down one diagonal); stages are set apart by whitespace or a thin rule, named by a short title or (a)(b)(c) letters on one shared baseline, never by cards around each one.'
  },
  {
    rule: 'One glyph family in one view',
    text: 'Every solid shares one projection (one oblique angle, upright verticals); the same object keeps one look through the figure, and the same picture travels through the pipeline (noised, pixelated, rendered) so the eye follows it.'
  },
  {
    rule: 'Colour is one dimension of meaning',
    text: 'Two to four hues, each naming one value of one dimension (axis, memory tier, modality, stage, source layer, ray), reused wherever that value appears (the SRAM orange on the pyramid and on the copied tile); everything else is ink, gray and white; pale fills with ink outlines, never a pastel outlined in its own darker hue.'
  },
  {
    rule: 'Pictures inside the drawing',
    text: 'Real images sit inside the drawn objects (on image planes, in a scene box, on the token maps, as video frames) at a readable size, never as small icons beside a box.'
  },
  {
    rule: 'Emphasis by size and uniqueness',
    text: 'The contribution is 2 to 6 times larger than a peer, or the only saturated, curved or photographic thing; quiet parts are small multiples of one shape at one size.'
  },
  {
    rule: 'Restrained type and hand-made touches',
    text: 'Two or three text sizes, TeX italic math for symbols, labels placed on the object (edge sizes H, W, C; r_1 … r_K over each map; a note at a tier); curves only where something jumps (skip arcs, a loop back), dotted guides and ellipsis dots for continuation, faded backgrounds behind rays.'
  }
]
