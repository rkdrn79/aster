// Style recipes of reference figures in 3D vision and neural rendering (`figures refs`).
// Our own text recipes of published figures (composition and glyph vocabulary, no images and no
// copied captions); the images stay in the user-local reference folder (research-figures-refs.mjs).

export const RECIPES_3D = [
  {
    id: 'nerf',
    title: 'NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis',
    arxiv: '2003.08934',
    year: 2020,
    figure: 'Fig. 2',
    aliases: ['NeRF', 'Neural Radiance Fields', 'radiance field'],
    genre: '3d-vision',
    kinds: ['method-overview', '3d-scene', 'pipeline'],
    keywords: [
      'ray',
      'sample point',
      'volume rendering',
      'image plane',
      'camera',
      'radiance field',
      'density along ray',
      'rendering loss',
      'view synthesis',
      'input and output scene'
    ],
    summary:
      "A faded toy-bulldozer photo sits inside a dotted grey cube with two slanted photo planes and red rays piercing it, so 'rays through a scene' is drawn instead of boxed; the cube is repeated after the network, then small curves and loss squares finish the row.",
    layout:
      'Big two-line serif titles across the top, then (a) cube scene with input tuple, a tiny three-bar network glyph, (b) a second cube with coloured sample dots, (c) two small sigma plots, (d) two loss squares; panel letters (a)-(d) share one baseline at the bottom. Story: left-to-right. Proportions: 3.4:1 (1797x534). (a) 33%, F_Θ 5%, (b) 33%, (c) 15%, (d) 12%; titles use the top 18% of height, letters the bottom 10%.',
    glyphs: [
      "cube with faded object inside: thin grey dotted perspective edges (about 1.5px, 3 visible faces); the object photo inside is washed to about 25% opacity so the rays stay readable → fig.perspective({ template: 'nerf-rays' })",
      'two image planes: slanted parallelograms facing each other across the cube, black 2px outline, white fill, a photo filling each; the far-left one is smaller than the near-right one → b.plane',
      'rays: thin red 2px lines running through both planes and the cube; small red heads inside, open blue chevron heads at the two outer ends; the segment behind a plane fades to pale pink → b.ray',
      'sample points: about 8 per ray; solid black dots (~12px) in (a), hollow grey-ringed dots in (b) with a few filled yellow or orange where density is high → b.ray',
      'network glyph: three tall narrow rectangles side by side, 3px blue outline, light grey fill, a large italic F with a subscript Θ under it → hand: fig.box x3 or fig.nn',
      "density-along-ray plot: thin black L-axes with arrowheads, one smooth 4px curve whose stroke ramps yellow to orange to brown with height; 'Ray 1' / 'Ray 2' sit above the curve → hand: fig.curve (gradient stroke) or fig.plot"
    ],
    colour: [
      'red-orange (#e8352b): camera rays',
      'blue (#2f6fd0): the network box, camera chevrons and every flow arrow',
      'yellow to orange to brown (#f2d21b, #f57c2f, #a8582c): density/colour value along a ray; reused for plot strokes, sample dots and loss squares',
      'neutrals: Black ink for plane outlines, axes and labels; the cube is light-grey dotted; the page is pure white; the only other colour is the object photo itself.'
    ],
    emphasis:
      'The cube with red rays is the biggest object and the only saturated red; the tiny blue network box sits on the title baseline between the two scenes, so the eye goes scene, network, scene.',
    type: 'serif (Computer Modern look) with italic LaTeX math; small axis labels in a plain sans; 4 sizes: column titles (~34px, two lines, regular weight), panel letters (~38px), math tuples and F_Θ (~28px, F larger), tiny labels Ray 1 / Ray 2 / sigma / Ray Distance (~18px). Titles and (a)-(d) letters are not bold; letters are in parentheses on one common baseline.',
    handmade: [
      'open chevron arrowheads on the ray ends',
      'photo faded inside a dotted box',
      'sample dots drawn as separate small circles, not a line',
      'gradient stroke on the curves matches the dots and squares',
      'arrows are loose arcs, not elbows'
    ],
    avoid:
      'Do not copy the bulldozer photo, the 5D-input wording or the F_Θ name; reuse only the cube-with-rays composition and the colour ramp that ties plot to samples.'
  },
  {
    id: 'mip-nerf',
    title: 'Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields',
    arxiv: '2103.13415',
    year: 2021,
    figure: 'Fig. 1',
    aliases: ['Mip-NeRF', 'mip-NeRF', 'cone tracing', 'anti-aliasing NeRF'],
    genre: '3d-vision',
    kinds: ['comparison', '3d-scene', 'teaser'],
    keywords: [
      'cone',
      'ray',
      'pixel footprint',
      'gaussian',
      'anti-aliasing',
      'multi-scale',
      'camera',
      'image plane',
      'side by side',
      'frustum'
    ],
    summary:
      'Two scenes share the same camera and 3x3 pixel grid: a thin ray with dots on the left, a translucent purple cone that turns into nested Gaussian blobs on the right, so the difference is a shape, not a sentence; a single orange-red pixel footprint is the only warm colour.',
    layout:
      'Left scene (a) with a ray from the eye through a pixel grid and one marked point; centre scene (b) with a cone from the same pixel; a small script N arrow; right scene with the cone replaced by Gaussian blobs; captions a) and b) at the bottom, one math label above each result. Story: left-to-right. Proportions: 3.0:1 (1795x598). (a) 33%, (b) cone scene 33%, N arrow 7%, Gaussian scene 27%; the plane-and-camera sit in the lower-left of each scene, the result floats upper-right.',
    glyphs: [
      'pixel image plane: slanted parallelogram split 3x3, near-white fill (#f6f6f6), black 2.5px grid lines; same size and place in all three scenes → b.plane',
      'camera: small open black eye-wedge (triangle with a short arc) at the bottom-left; two straight black lines run from it to the pixel corners → b.camera',
      'pixel footprint: tilted ellipse on the plane, 3px red-orange outline, salmon fill; a tiny red dot marks the centre in the ray scene → hand: fig.curve (ellipse)',
      'cone: frustum widening away from the pixel, 2.5px dark purple outline; 3 solid cross-section ellipses with dashed back arcs; fill is lavender, denser in the middle → b.cone',
      'Gaussian blobs: three tilted ovals growing and fading with distance, each made of 3 nested translucent purple rings with a darker core; a dashed purple cone outline surrounds them → b.gaussian',
      'ray with samples: black ray with a filled head; one dark indigo dot at o + td and two pale lavender dots at 50% opacity → b.ray'
    ],
    colour: [
      'purple (#5b2a91, fills #d9c3e6 to #a05fb8): the Mip-NeRF cone and its Gaussians, one hue only, depth shown by opacity',
      'red-orange (#ee4b2b, fill #f5a79c): the pixel being rendered; used nowhere else',
      'dark indigo (#2c1a63): the single sample point on the ray',
      'neutrals: Black for planes, rays, camera, arrows and all text; near-white grey for the pixel grid; pure white page, no panel boxes.'
    ],
    emphasis:
      'The purple cone is the largest and only multi-tone object; the orange-red pixel is the one warm spot, so the eye lands on where the cone starts.',
    type: "serif with bold-upright vectors (o, d, x) and italic LaTeX math; 3 sizes: captions a) NeRF / b) Mip-NeRF (~44px), math labels gamma(x), E[gamma(x)], N (~36px), tiny t0, t1, r-dot, o+td (~28px). Almost no words: every label is a symbol; captions use the letter-then-parenthesis form 'a)'.",
    handmade: [
      'the same camera and grid redrawn identically in each scene',
      'dashed back edges on the cone cross-sections',
      'one hue in several opacities for cone and Gaussians',
      'label arrows curve around the object instead of pointing straight',
      'dots fade with distance'
    ],
    avoid:
      'Do not copy the o + td, t0/t1 or gamma notation; keep the idea of two scenes on one camera and one accent colour for the unit being sampled.'
  },
  {
    id: 'plenoxels',
    title: 'Plenoxels: Radiance Fields without Neural Networks',
    arxiv: '2112.05131',
    year: 2021,
    figure: 'Fig. 2',
    aliases: ['Plenoxels', 'plenoptic voxels', 'sparse voxel grid'],
    genre: '3d-vision',
    kinds: ['method-overview', '3d-scene', 'pipeline'],
    keywords: [
      'voxel',
      'sparse grid',
      'interpolation',
      'zoom in',
      'ray',
      'volume rendering',
      'spherical harmonics',
      'grid vertex',
      'inset',
      'optimisation'
    ],
    summary:
      'A sparse voxel grid made of dashed cubes and coloured vertex dots, a pale-blue funnel that zooms one voxel into a larger cube with shaded spheres at its corners and yellow arrows, then a small plot and a formula; the zoom makes it read like a walk-through, not a flow chart.',
    layout:
      'Training photo plane and ray on the left, sparse voxel grid around the ray, a translucent funnel opening into a big zoomed cube (b) with a shaded-sphere grid above it, then a plot and predicted-colour square (c) and a formula (d) on the right. Story: left-to-right. Proportions: 3.4:1 (2029x599). (a) 36%, funnel 12%, (b) 28%, (c) and (d) 24% stacked, c above d.',
    glyphs: [
      'sparse voxel grid: dashed light-grey cube edges forming a plus-shaped cluster of cubes; vertex dots in navy, teal and green, smaller when farther away; one cube filled translucent blue → fig.voxelGrid',
      'photo plane with ray: upright parallelogram, black 2px outline, white fill with a photo; a black ray passes through it with a blue open chevron camera at one end and a filled arrowhead at the other; the ray turns light grey inside the volume → b.plane + b.ray',
      'funnel zoom: pale blue translucent trumpet shape (gradient fading to white) from the highlighted voxel to the big cube, no outline → hand: fig.polyline (filled, low opacity)',
      'zoomed cube with corner spheres: dashed grey cube edges; at each of 8 corners a radially shaded ball in its own colour mix; thin yellow arrows (#f6b823) from all corners to a central dot that sits on the ray → fig.voxelGrid (one highlighted voxel)',
      'shaded-sphere table: 3x3 balls in each of three colour groups (red, green, blue) on a white tile, with a sigma sign and a black curved arrow into the cube → fig.tokens or hand: fig.box grid',
      'density plot: small L-axes, one smooth 3px curve with a green-to-blue gradient stroke and two bumps; a dotted black curved arrow links a ray point to the plot → hand: fig.curve + fig.plot'
    ],
    colour: [
      'navy to teal to green (#2b3f9c, #1c8aa0, #6fcf6f): values stored at grid vertices and plot stroke',
      'pale blue (#9ccbe0, translucent): the selected voxel and the zoom funnel',
      'yellow-orange (#f6b823): interpolation arrows into one point',
      'red, green, blue ball groups: the three colour channels of the harmonics table',
      'neutrals: Black for the ray, plane outline and arrows; dashed mid-grey for all lattice edges; white page with no boxes.'
    ],
    emphasis:
      'The zoomed cube in the middle is the largest object and the only place with shaded spheres and yellow arrows; the funnel leads the eye to it from the small highlighted voxel.',
    type: 'sans (Helvetica-like) for captions and labels, serif italic LaTeX for the formula; 3 sizes: captions a) b) c) d) (~34px), small labels such as Training Image or Predicted Color (~26px), formula (~40px). Captions repeat the letter-then-parenthesis form and sit on one line; labels are plain weight.',
    handmade: [
      'dots shrink with distance',
      'light-grey ray segment inside the volume',
      'translucent funnel connecting a small voxel to a big one',
      'each corner ball is a tiny shaded sphere',
      "dotted black arc for the 'sample' link"
    ],
    avoid:
      'Do not copy the plant photo, the harmonics wording or the minimize-loss formula; keep the zoom funnel and the corner-sample idea.'
  },
  {
    id: 'instant-ngp',
    title: 'Instant Neural Graphics Primitives with a Multiresolution Hash Encoding',
    arxiv: '2201.05989',
    year: 2022,
    figure: 'Fig. 3',
    aliases: ['Instant-NGP', 'instant NGP', 'hash encoding', 'multiresolution hash'],
    genre: '3d-vision',
    kinds: ['pipeline', 'method-overview', 'data-plot-as-diagram'],
    keywords: [
      'hash table',
      'multi-resolution',
      'grid lookup',
      'interpolation',
      'encoding',
      'feature vector',
      'concatenation',
      'lookup table',
      'numbered steps',
      'mlp'
    ],
    summary:
      'A faded low-poly bunny under two overlaid grids of different resolution (pink fine, blue coarse) with numbered corner circles, then lookup tables, interpolation squares and a concatenated vector all in the same two colours, joined by square-cornered connectors and a few smooth black curves.',
    layout:
      'A big framed square with the bunny and two shifted grids (1); two tall index tables (2); two interpolation squares with dashed diagonals (3); a coloured stacked vector (4); a small neural network glyph (5); numbered captions underneath. Story: left-to-right. Proportions: 2.7:1 (2282x837). (1) 36%, tables 7%, interpolation 13%, vector 6%, network 20%; the rest is gaps; top 8% holds dimension labels, bottom 10% the captions.',
    glyphs: [
      "overlaid multi-resolution grids: inside one black 2px square, a thick pink (#f28b8e) grid and a thick blue (#8ec7e0) grid offset from each other, each with dashed extension lines across the square; a low-poly bunny at ~12% grey behind → fig.perspective({ template: 'hash-grid' }) or hand: fig.box + fig.polyline",
      'numbered vertex circles: white-filled circles with thick coloured outlines (~5px) at grid corners, a black index digit inside; a small hollow black dot marks the query point → fig.node',
      'index table: two-column cell strip, indices 0 to 7 on the left, used rows filled pink or blue, unused rows white, thin black cell lines; brackets name F (width) and T (height) → fig.tokens or fig.matrix',
      'interpolation square: thick pink or blue square with hollow circles at corners, dashed same-colour diagonals meeting at a black-ringed point → fig.box + fig.node',
      'stacked feature vector: vertical column of cells: pink, pink, blue, blue, green, green, green, with braces L·F and E at the right and a short up arrow from xi → fig.tiledMatrix({ rows: 6, cols: 1, highlight }) (cells coloured by level)',
      'elbow connectors: 1px black orthogonal lines from used table rows to square corners, with small hop bumps where lines cross → fig.arrow (elbow)'
    ],
    colour: [
      'pink (#f28b8e): one resolution level: its grid, table rows, square and vector cells',
      'light blue (#8ec7e0): the other resolution level, carried through the same four glyphs',
      'pale green (#a8dfa8): extra input appended to the vector',
      'neutrals: Black for the frame, index digits, query dots and curved arrows; grey for the faded bunny and network; white elsewhere.'
    ],
    emphasis:
      'Colour identity carries the story: pink and blue are repeated in all four glyph stages, so the eye follows them; the big framed square on the left is the visual anchor.',
    type: 'serif (Libertinus look) with italic math; bold only for the caption numbers (1)-(5); 3 sizes: captions (~28px), table indices and level labels (~24px), small italic dimension labels L = 2, b = 1.5 and 1/N0 (~22px). Caption numbers are bold, caption words regular; level labels l = 0 and l = 1 are italic in the level colour.',
    handmade: [
      'bunny only a ghost behind the grid',
      'black curved arrows with clean elbow lines mixed in',
      'hop bumps where connector lines cross',
      'dashed grid extensions beyond the solid cells',
      'dimension ticks drawn as plain brackets'
    ],
    avoid:
      'Do not copy the bunny, the L = 2, b = 1.5 numbers or the exact 8-entry tables; keep the two-colour identity carried through every stage.'
  },
  {
    id: 'eg3d',
    title: 'Efficient Geometry-aware 3D Generative Adversarial Networks',
    arxiv: '2112.07945',
    year: 2021,
    figure: 'Fig. 2',
    aliases: ['EG3D', 'tri-plane', 'triplane', '3D GAN'],
    genre: '3d-vision',
    kinds: ['comparison', 'architecture-block', '3d-scene'],
    keywords: [
      'triplane',
      'feature plane',
      'voxel grid',
      'mlp layers',
      'side by side',
      'query point',
      'fully connected',
      'orthogonal planes',
      'dashed link',
      'comparison of representations'
    ],
    summary:
      'Three columns split by thin black rules compare an MLP, a voxel grid and a tri-plane, each queried at the same red point and each feeding the same small FC stack; the FC layers are flat green slabs and the voxel and planes are line drawings, so the structure is the picture.',
    layout:
      'Three equal-height columns separated by vertical black rules: left a tall FC/PE stack with elbow arrows, middle a wireframe cube with a red point and one dashed link, right three orthogonal gridded planes with three dashed links merging in a circled plus; every column ends in a two-slab FC block with Density and Color outputs. Story: left-to-right. Proportions: 1.85:1 (1490x804). Left 29%, middle 40%, right 31%; the two rules at 29% and 68%; each column puts its structure in the top 65% and the FC output block in the bottom 25%.',
    glyphs: [
      'FC layer slab: flat box in oblique view: light-green (#e7f7cf) front face, thin black 1px edges, a short depth top and right face; layers stacked with shared edges; the text FC centred on the front face → fig.tensor or fig.stack',
      'positional-encoding block: same slab shape in light teal (#b9dde0), wider than tall → fig.tensor',
      "wireframe cube: thick black outer edges (about 3px) and thin grey interior grid lines (1px, 2x2 cells), one perspective view; a red-pink dot (#f08080) with a black rim sits on the front-bottom edge → fig.voxelGrid({ n: [2, 2, 2], lattice: 'solid', vertices: false })",
      "three orthogonal planes: thin-grid planes crossing like a 3D plus sign, white with 1px grey lines, thick black edge on each plane border; a red dot sits on each plane, with a drop line to the shared point → fig.perspective({ template: 'triplane' })",
      'dashed gather curves: long dashes from point to circled plus, labelled F_XY, F_XZ, F_YZ; a single dashed arc in the cube column labelled F → fig.curve',
      'open-head arrows: black 1.5px orthogonal lines with open hollow double-chevron heads; the Direction line bypasses the stack and enters later from the right → fig.arrow (elbow)'
    ],
    colour: [
      'light green (#e7f7cf): fully connected layers, the same in all three columns',
      'light teal (#b9dde0): positional encoding',
      'coral red (#f08080): the shared query position',
      'neutrals: Black for outlines, rules, arrows and the cube; grey 1px hairlines for grid cells; white page, no panel fills.'
    ],
    emphasis:
      'The query point is the only strong colour on the structures and appears in all three columns at the same height, so the eye compares how each representation answers the same question.',
    type: 'plain sans (Arial look), no italic except subscripts F_XY; 2 sizes: labels like Position, Direction, Density, Color, FC (~24px) and subscripted F labels (~22px with smaller sub). No column titles; the drawn structure names itself. Labels sit directly on slabs.',
    handmade: [
      'hollow open arrowheads',
      'flat slabs with a thin depth edge',
      'thick outer cube edges against thin interior grid',
      'dashed arcs bending around the structure',
      'rules between columns drawn as plain black lines'
    ],
    avoid:
      'Do not copy the exact FC counts (5, 3, 2) or the Direction/Density/Color labels; keep the same-query-point trick.'
  },
  {
    id: 'tensorf',
    title: 'TensoRF: Tensorial Radiance Fields',
    arxiv: '2203.09517',
    year: 2022,
    figure: 'Fig. 3',
    aliases: ['TensoRF', 'tensor decomposition radiance field', 'vector-matrix decomposition'],
    genre: '3d-vision',
    kinds: ['method-overview', 'pipeline', '3d-scene'],
    keywords: [
      'tensor decomposition',
      'factor',
      'isometric plane',
      'vector and matrix',
      'axis colour',
      'sample point',
      'rounded panel',
      'feature plane',
      'sum of factors',
      'radiance field'
    ],
    summary:
      'A black wireframe cube holds the object and a red ray; six rounded panels each show one isometric corner with a coloured wall and a coloured rod and a dashed drop-line from a blue sample, so tensor factors are drawn as geometry, and fat beige arrows carry the flow right.',
    layout:
      'Scene cube with camera at the left, a white pill holding the coordinate tuple above it, two rows of three rounded panels (top row appearance, bottom row density) joined by circled plus or plus signs, then at the far right small boxes, a result pill, a ray plot and a loss. Story: left-to-right. Proportions: 3.1:1 (2062x657). Cube 23%, three panel columns 43% (each about 12.5%), right column 29% holding B^T, S, the sigma-c pill, plot and loss.',
    glyphs: [
      'scene cube: thick 4px black cube edges in perspective, dashed black lines on hidden edges; the object photo inside; a red-to-pink gradient ray across it carrying three navy dots; a camera icon outside on the left → b.box + b.ray + b.camera',
      'isometric corner panel: rounded rectangle with a dark-navy 3px border, white fill; inside, a light-grey floor and one coloured wall standing at the back; one vector as a thin coloured rod along a floor edge → fig.panel + fig.planes',
      'axis colour pairs: panel 1: red rod + blue wall; panel 2: green rod + pink wall; panel 3: cyan rod + yellow floor, so each axis keeps its colour in both rows and in the labels → fig.planes',
      'sample marker: navy dot with a black dashed line that drops to the wall and then to the rod, ending in small diamond markers → hand: fig.polyline (dashed)',
      "corner badge: small rounded square with navy outline overlapping the panel's bottom-right corner, holding the factor label in italic math → fig.box + fig.math",
      'fat flow arrows: pale peach (#fbe3d6) block arrows with a darker peach outline that bend with a rounded elbow; a thin dash-dot line for weak links → fig.arrow (elbow)'
    ],
    colour: [
      'red, green, cyan (#f08080, #b5e0a0, #4ec0e8): the vector factor for the X, Y, Z axis',
      'blue, pink, yellow (#b4c6e7, #e8b0d0, #fff27a): the matrix factor on the opposite plane',
      'navy (#223a7a): panel borders and sample dots',
      'peach (#fbe3d6): flow between stages',
      'neutrals: Black cube and dashed drop lines; light grey (#f0f0f0) floors; white panel fill; light blue (#dbe8f5) rounded boxes for operators.'
    ],
    emphasis:
      'The six panels dominate by size and colour and mirror each other row to row, so the matching coloured labels lead the eye; the cube is darker and heavier to anchor the left edge.',
    type: 'serif italic LaTeX math in most labels, sans for the words Ray Distance and Rendering loss; 4 sizes: badge labels (~34px), panel math (~22px, tiny subscripts), operator letters in boxes (~30px), plot words (~24px). Labels stay black; the colour sits only in the geometry.',
    handmade: [
      'dashed drop-lines ending in diamonds',
      'thick peach block arrows with rounded elbows',
      'badge overlapping the panel corner',
      'rod and wall drawn in the same isometric angle in every panel',
      'tiny photo inside the wireframe cube'
    ],
    avoid:
      'Do not copy the bulldozer photo or the A^X_c notation; reuse the idea of one colour per axis carried into labels.'
  }
]
