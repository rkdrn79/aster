// `figures plot kit`: aster_plot's functions with their options and what they draw, made from the
// helper's own signatures and docstrings, so an agent need not read the helper's source.
export const PLOT_API_INDEX = String.raw`Style and colour:
  style()
      The style in use (graphite with its own accent until use() picks one).
  use(preset=None, accent=None, math='cm', font=None)
      Picks the preset and accent (as fig.style(preset, { accent }) on the canvas) and sets matplotlib's defaults for print: 8 pt labels, 7 pt ticks and legends, thin spines.
  color(role='ours', part='solid')
      A colour by role: ours (the accent), ours-fill, ours-ink, baseline, good, bad, ink, line, muted, block, strong, mid, panel; or an accent swatch name ('teal', 'clay-ink').
  series(n, ours=0, hues=False)
      Colours for n methods: the accent for ours (an index, or None), grays for the rest, or other hues (hues=True) when the methods are not baselines.
  ramp(n, base=None, light=0.3)
      n steps of one hue from light to full (ablations: the full model darkest).
  blend(c0, c1, t)
      The colour a fraction t of the way from c0 to c1 (t one value or an array: then a list), mixed in linear light: a time colour from gray noise (t=0) to the accent (t=1).
  cmap(kind='seq', base=None, name=None)
      Perceptual colour maps from the style: seq (white → accent → its ink), div (bad ink → white → accent ink), gray; or a matplotlib perceptual one ('viridis', 'cividis', 'magma').
  page_size(size='single', height=None, venue=None)
      (width, height) in inches: single, double, onehalf or (w, h); venue picks its widths.
Panels, labels and legends:
  panels(layout='a', size='single', height=None, venue=None, width_ratios=None, height_ratios=None, kinds=None, sharex=None, sharey=None, labels='auto', titles=None, label_loc='top', legend=None, style=None, accent=None, slug=None, view=(20, 50), math='cm', panel=False)
      A page-true figure of panels on one GridSpec.
      
      layout: "abc", "ab;cc" (c spans the second row), ["ab", "cd"], or (rows, cols); "." is empty.
      kinds: {"c": "3d" | "polar" | "legend" | "joint" | "off"}; 2d by default.
      sharex / sharey: True, "row", "col", or groups such as ["ab", "cd"].
      labels: "(a)" (default with two or more panels), "a", "A", None, or a list of strings.
      titles: {"a": "ODE"} prints "(a) ODE". label_loc: "top" (left, above) or "bottom" (centred
      under the panel, a subcaption). legend: "bottom", "top" or "right" adds a legend cell spanning
      the figure; p.legend() fills it and sizes it to fit. panel=True: the plot is made for a cell of a diagram (fig.plot),
      so its size need not be a column width.
  p.legend(handles=None, where=None, ncol=None, order=None, **kw)
      A frameless legend for the figure: in the legend cell (panels(legend=...)), sized to fit, columns chosen to fit the width; else above the panels (where="top", the default) or below them ("bottom"), with room made for it. Handles default to every labelled artist once (a line over a fill for bands); order lists labels to put first.
  p.xlabel(text, keys=None, **kw)
      One x label centred under several panels (keys, default all in the bottom row): the shared label instead of one per panel.
  p.ylabel(text, keys=None, **kw)
      One y label centred beside several panels (keys, default all in the left column).
  p.inset(key, bounds=(0.58, 0.55, 0.38, 0.4), xlim=None, ylim=None, mark=True)
      An inset axes inside panel key (bounds in axes fraction). With xlim and ylim it zooms: the region is boxed in the parent and joined to the inset.
  p.place(key, rect, units='scene')
      Puts panel key at an exact rectangle (x, y, w, h) from the top-left (see ap.place).
  p.save(slug=None, out=None, quiet=False)
      Checks the figure and writes its PDF, SVGs, PNG and manifest (see ap.save).
  figure(size='single', height=None, venue=None, style=None, accent=None, slug=None, kind='2d', math='cm', panel=False)
      One panel: returns (p, ax). panel=True for a plot made to sit in a diagram's cell.
  alpha_mix(value, a, over='#ffffff')
      value at opacity a over white, as an opaque colour (prints the same everywhere).
  handle(label, color=None, kind='line', hatch=None, ls='-', marker=None, lw=1.2, alpha=1.0, edge=None, hollow=False)
      A legend entry drawn by hand: kind line, patch (a fill edged in its own colour, or edge=), band (a line over its light fill), or marker; hollow=True for open markers.
  legend(ax, handles=None, loc='best', ncol=None, where=None, order=None, **kw)
      A frameless legend for one panel: where="above" (over the plot, columns fitted to its width, the title moved up), "right" (beside it), or inside: loc="best" takes a corner that covers no data, else goes above. order lists labels to put first.
  label_lines(ax, lines=None, texts=None, x=None, gap=7.5, pad=3)
      Labels at the right end of each line instead of a legend, spread so none overlap (gap in pt). texts default to the lines' labels.
  note(ax, text, xy, xytext=(12, 10), arrow=True, color=None)
      A short 7 pt note pointing at xy with a thin arrow (offset in pt).
  no_ticks(ax, keep_frame=False)
      A schematic panel: no ticks; the frame kept as thin muted lines when asked.
Saving:
  here(value)
      Paths relative to the plot script's folder, made absolute (strings, lists and dicts).
  save(target=None, slug=None, out=None, quiet=False)
      Writes <out>/<slug>.pdf, .svg, .embed.svg, .png and <slug>.plot.json, checks the figure first, and returns the manifest. out defaults to the folder above src/; slug to the script's name without .plot.py.
Checks:
  check(target=None)
      What a reviewer would flag at print size, as the diagram lint reports it: {"errors": [...], "warnings": [...], "notes": [...]}, each {code, id, message, box}.
Toy maths (seeded, exact: generation and optimisation figures):
  ap.toy.rng(seed=0)
      numpy's Generator for a seed: every toy helper is deterministic.
  ap.toy.ring(k=8, radius=2.0, std=0.18, n=600, seed=0)
      n samples from k Gaussians on a ring; returns (samples, means, std).
  ap.toy.moons(n=600, noise=0.07, seed=0)
      
  ap.toy.checkerboard(n=800, seed=0)
      
  ap.toy.swiss_roll(n=1200, noise=0.05, seed=0)
      (xyz, t): points on a Swiss roll and their position along it.
  ap.toy.mix(means, std=0.15, weights=None, labels=None)
      A Gaussian mixture (Mix): .sample(n, seed), .pdf(x), .score(x), .given(label).
  ap.toy.point(dim=2, std=1.0)
      N(0, std^2 I) as a one-component Mix: the noise end of a flow.
  ap.toy.interpolant(x0, x1, t, schedule='linear', gamma=0.0, z=None, seed=0)
      x_t = a(t) x0 + b(t) x1 + gamma(t) z for given pairs: schedule linear (straight), trig (curved, a = cos, b = sin) or vp; gamma > 0 adds the bridge noise c sqrt(t(1-t)) z (stochastic interpolants). t one value, or an array: then (n, T, d) paths.
  ap.toy.bridge_velocity(x, t, src, dst, schedule='linear', gamma=0.0, coupling=None)
      The exact velocity E[dx_t/dt | x_t = x] between two Mix (src at t=0, dst at t=1) for an interpolant (schedule, gamma) and a coupling of their components: independent (I-CFM), "class" (component i to i) or a matrix. Its ODE carries src to dst.
  ap.toy.bridge_score(x, t, src, dst, schedule='linear', gamma=0.0, coupling=None)
      grad log p_t(x) along the same interpolant.
  ap.toy.bridge_density(x, t, src, dst, schedule='linear', gamma=0.0, coupling=None)
      p_t(x) along the same interpolant (x (n, d), or (n,) in 1D).
  ap.toy.flow(means, std=0.15, weights=None, n=60, steps=80, kind='ode', eps=0.6, seed=0, x0=None, source=None, schedule='linear', gamma=0.0, coupling=None)
      Sample paths from a source (t=0; N(0, I) by default, or source=ap.toy.mix(...) for mixture-to-mixture) to an isotropic Gaussian mixture (t=1): kind ode (the exact probability-flow paths, curved), straight (the same endpoints joined by lines, as after rectification) or sde (the same marginals with noise, eps sets how much). schedule, gamma and coupling as in bridge_velocity. Returns (paths of shape (n, steps+1, d), times).
  ap.toy.gmm_velocity(x, t, means, std, weights=None)
      The exact flow-matching velocity E[x1 - x0 | x_t] for x_t = (1-t) x0 + t x1, x0 ~ N(0, I), x1 from an isotropic Gaussian mixture.
  ap.toy.gmm_density(x, t, means, std, weights=None)
      p_t(x) along the same path (x of shape (n, d)).
  ap.toy.integrate(v, x0, times, method='rk4')
      Integrates dx/dt = v(x, t) over times (increasing or decreasing) with rk4, heun or euler; returns the path, shape (n, T, d) for x0 (n, d), (T, d) for one point.
  ap.toy.euler_maruyama(drift, diffusion, x0, times, seed=0)
      dx = drift(x, t) dt + diffusion(t) dW by Euler–Maruyama over times (decreasing times integrate backwards, the noise scaled by sqrt|dt|); returns the path like integrate.
  ap.toy.cost(x, y)
      Squared Euclidean costs |x_i - y_j|^2 (n, m).
  ap.toy.assignment(C)
      The exact optimal assignment for a square cost matrix: perm with row i matched to column perm[i] (scipy when present, else the Hungarian method; fine up to n ~ 1000).
  ap.toy.sinkhorn(C, a=None, b=None, eps=None, iters=2000, tol=1e-09)
      The entropic OT plan (n, m) by log-domain Sinkhorn: marginals a, b (uniform by default), eps the entropy weight in cost units (default 5% of the median cost; smaller is closer to exact OT and slower).
  ap.toy.couple(x0, x1, kind='ot', batch=None, eps=None, seed=0)
      Pairs samples of two sets: returns (x0, x1) reordered so pair i is (x0[i], x1[i]). kind independent (a seeded shuffle, as I-CFM), ot (exact assignment, equal sizes), minibatch (exact OT inside shuffled batches of batch, as OT-CFM) or sinkhorn (each x0 draws its partner from the entropic plan).
  ap.toy.pair_velocity(x, t, x0, x1, sigma=0.1, schedule='linear')
      The velocity a conditional flow-matching model learns from pairs (x0[k], x1[k]) with paths N(a x0 + b x1, sigma^2): E[a' x0 + b' x1 | x_t = x], exact on these samples.
  ap.toy.pair_flow(x, x0, x1, sigma=0.1, steps=60, schedule='linear', method='heun')
      Paths of fresh points x under pair_velocity from t=0 to 1: (paths (n, T, d), times).
  ap.toy.process(kind='vp', beta=(0.1, 20.0), sigma=(0.01, 10.0))
      A forward diffusion (Process): vp or ve, with alpha(t), sigma(t), f, g2, marginal.
  ap.toy.diffusion_score(x, t, data, process='vp', label=None, guidance=0.0)
      grad log p_t(x) of a data Mix diffused to t (exact). With label, the class-conditional score; guidance w > 0 is classifier-free guidance (Ho & Salimans 2022): (1 + w) score(x | label) - w score(x).
  ap.toy.sample(data, sampler='ode', process='vp', steps=60, n=200, label=None, guidance=0.0, eta=0.0, t_min=0.001, seed=0, x1=None)
      Samples of a data Mix from noise by the exact score, t from 1 to t_min: sampler ode (the probability-flow ODE, Heun), sde (the reverse SDE, Euler–Maruyama), ddim (eta=0 deterministic, eta=1 is ancestral DDPM) or ddpm; process vp or ve; label and guidance for classifier-free guidance. Returns (paths (n, steps+1, d), times), 1D data (n, T).
  ap.toy.fn(name='rosenbrock', **kw)
      A 2D test function with exact gradients (TestFn): rosenbrock (b=100), beale, himmelblau, booth, rastrigin, quadratic (kappa, angle), saddle, sharp-flat (Sophia's sharp and flat directions), two-basins. Or fn(f=..., grad=..., hess=None) for your own.
  ap.toy.landscape(kind='two-basins')
      f(x, y) for an optimisation landscape: two-basins, rosenbrock (log-scaled, gentle) or saddle; a TestFn, so f.grad(p) is exact.
  ap.toy.optimize(fn, start=None, method='gd', lr=0.1, steps=50, momentum=0.9, betas=None, eps=1e-08, rho=1.0, gamma=1.0, noise=0.0, cautious=False, weight_decay=0.0, seed=0)
      An optimiser's path (steps+1, 2) on fn (a TestFn, a name, or grad(p) -> (2,)) from start, with exact gradients (noise adds Gaussian gradient noise, as SGD). method: gd, momentum (heavy ball), nesterov, rmsprop, adam, sign (sign descent), signum, lion, newton (full Hessian: drawn to saddles), diag-newton (per coordinate), sophia (clipped diagonal Newton: lr * clip(m / max(gamma h, eps), rho); no EMA unless betas). cautious masks update entries whose sign disagrees with the gradient (C-Optim).
  ap.toy.descend(f, start, lr=0.08, steps=60, momentum=0.0, noise=0.0, seed=0)
      An optimisation path on f by gradient descent (optional heavy-ball momentum and gradient noise, as SGD); exact gradients for a TestFn, finite differences otherwise.
Trajectories, fields, teasers:
  path(ax, xy, color=None, t=None, cmap_=None, fade=(0.4, 1.0), lw=1.2, arrows=0, start=True, end=True, label=None, zorder=3)
      One trajectory: faded from start to end in one colour, or coloured by t with cmap_. arrows: n small heads along it; start (open circle) and end (filled) markers.
  paths(ax, many, color=None, lw=0.6, fade=(0.12, 0.7), ends=True, label=None, zorder=2, end_size=4.0, start_color=None)
      Many sample paths (array (n, T, 2)), thin and fading toward their end, with small dots where they start (gray) and end (in colour).
  band(ax, t, mean, sd, k=2.0, color=None, ramp=None, alpha=0.22, lw=0.8, line=True, label=None, zorder=2, chunks=24)
      A 1D Gaussian path over t (a conditional p_t(x | z)): the mean line and the band mean ± k sd, its width following sd(t), see-through (alpha) so overlapping bands darken. ramp=(c0, c1) colours it from c0 at the start to c1 at the end (gray noise to the accent); else one colour. The legend shows a line over a fill.
  landscape(ax, f, xlim=(-2.5, 2.5), ylim=(-2, 2), n=160, levels=12, filled=True, cmap_='light', lines=True, alpha=1.0)
      A 2D loss landscape as light filled contours (gray by default, so paths in colour stand out; low is dark) with thin level lines.
  field(ax, f, xlim=(-2, 2), ylim=(-2, 2), n=15, kind='quiver', color=None, by_magnitude=False, density=0.9, lw=0.6, t=None)
      A vector field f(x, y) -> (u, v): quiver arrows of equal length (direction only, the magnitude in tone when by_magnitude) or streamlines (kind="stream").
  sampling_1d(ax, paths_, times, density=None, snapshots=(0.0, 1.0), color=None, lw=0.5, width=0.12, ends=('noise', 'data'), fill=True, alpha=(0.18, 0.55))
      The score-SDE teaser: 1D samples moving along t (x axis) with the density drawn as a profile at each snapshot time. paths_ (n, T) values over times; density(y, t) -> p.
  flow_strip(ax, paths_, times, snapshots=(0, 0.25, 0.5, 0.75, 1), color=None, n_paths=30, gap=0.35, points=500, lw=0.5, frame=True, labels=True, ends=('noise', 'data'), masses=(0.5, 0.85), seed=0, exact=None)
      Noise to data in one panel: the samples at a few times as tiles in a row (density contours and dots, gray at t=0 turning into the accent at t=1), joined by the paths of n_paths samples. paths_ (n, T, 2) over times. exact(xy, t) -> p draws each tile's contours from the exact density (ap.toy.bridge_density) instead of a KDE of the samples, so an ODE and an SDE strip show the same marginals.
Distributions:
  density(ax, xy=None, grid=None, color=None, masses=(0.5, 0.8, 0.95), filled=True, lines=True, points=0, label=None, lw=0.7, n=120, xlim=None, ylim=None, seed=0, tones=(0.14, 0.42), bw=None)
      2D density as highest-density contours (the regions holding 50/80/95% of the mass), light fills darker inward, a thin outline per level; points overlays that many samples. Give samples xy, or a precomputed grid=(X, Y, Z).
  mixture(ax, means, covs=None, weights=None, color=None, stds=(1, 2), centres=True, fill=True)
      A Gaussian mixture as covariance ellipses at 1 and 2 std, line weight by weight.
  joint(j, x, y, groups=None, colors=None, labels=None, kind='density', marginal='kde', masses=(0.5, 0.8, 0.95), points=0, bins=30)
      A joint plot in a Joint (panels kinds={"a": "joint"}): densities (or scatter) in the main axes, 1D densities (or histograms) on the top and right.
  densities(ax, data, ours=0, colors=None, fill=True, bw=None, rug=False, grid=None, lw=1.1, means=False)
      1D densities (dict name -> samples): ours in the accent, the rest gray, light fills.
  hist(ax, data, bins=30, ours=0, colors=None, density_=True, kind='step')
      Histograms with shared bins: outlined steps (kind="step") or light filled bars.
  violin(ax, data, ours=None, colors=None, quartiles=True, points=False, width=0.75, seed=0)
      Violins (dict name -> samples) with the median and quartiles inside.
  box(ax, data, ours=None, colors=None, points=True, width=0.5, seed=0)
      Box plots (median, quartiles, 1.5 IQR whiskers) with the raw points jittered beside.
  ecdf(ax, data, ours=0, colors=None, lw=1.1)
      Empirical CDFs as steps (dict name -> samples).
  ridgeline(ax, data, overlap=0.55, colors=None, ours=None, fill=True, grid=None, lw=0.7, label_x=None, bw=None, gradient=True)
      Stacked densities (dict label -> samples), first at the top, each overlapping the next; labels at the left. gradient ramps the accent from light to dark down the stack.
3D:
  clean3d(ax, view=(20, 50), aspect=(1, 1, 0.5), ticks=False, labels=None, zoom=1.3, fit=False)
      A quiet 3D axes: no panes, no grid, transparent axis lines, no ticks (or a few), box aspect [1, 1, 0.5], seen from (elev 20, azim 50). labels=("x", "y", "z") names the axes: without ticks along the box's front edges, kept on the page. fit=True zooms the box to fill the cell when saved.
  surface(ax, X, Y, Z, cmap_='surface', path=None, f=None, floor=False, levels=10, shade=True, wire=5, path_color=None, alpha=1.0, end_marker=True, paths=None, ours=None, styles=None, hidden='dashed', contours=0)
      A loss landscape or any z = f(x, y) on a regular grid: softly lit faces (light grays, low darker, so paths in the accent stand out; cmap_="soft" tints them), contours= level lines on the surface, faint ones on the floor (floor=True), and paths on it: path (one) or paths (a dict name -> (N, 2) with f, or (N, 3); a list for unnamed ones), ours (a name) in the accent and the rest gray with dashes, styles a dict name -> path3d options. A path's stretches the surface hides are dashed (hidden="dashed"), faint or omitted, recomputed when the view changes; ap.view3d(ax) picks a view that shows them. The faces are rasterized (vector faces leave seams in PDF viewers); the check notes it.
  path3d(ax, xyz, X=None, Y=None, Z=None, color=None, lw=1.3, ls='-', marker=None, ms=2.6, label=None, hidden='dashed', start=True, end=True, zorder=5, halo=True)
      A path in 3D (N, 3) drawn with the surface (X, Y, Z) in mind: the stretches the surface hides are dashed and faint (hidden="dashed"), faint ("faint") or left out ("omit"), the rest drawn over it with a thin white halo. It is redrawn when the view changes (ap.view3d, ap.save).
  surface_lines(ax, X, Y, Z, contours=0, wire=0, color=None, lw=0.35, alpha=0.8)
      Level lines (contours) and a wire grid (every wire-th row and column) drawn on the surface, the parts behind it left out (they follow the view, like path3d).
  label3d(ax, xyz, text, offset=(0, 6), ha='center', va=None, size=None, color=None, marker=None, ms=6, face=None)
      A 7 pt label at a 3D point, offset in pt on the page (it follows the view), optionally with a marker there ("*" for an optimum, "o" for a start).
  view3d(ax, X=None, Y=None, Z=None, paths=None, elevs=(18, 26, 34, 42, 52), azims=(0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345), apply=True)
      Picks the view (elev, azim) that shows the paths best: little of each hidden behind the surface, long on the page rather than foreshortened, apart from each other, the surface not edge-on. paths default to the axes' ap.surface / ap.path3d paths. Returns it.
  fit3d(ax, margin=0.03)
      Zooms a 3D axes so its box and its axis names fill the cell (matplotlib leaves wide margins around a 3D box).
  hidden3d(ax, xyz, X, Y, Z, samples=48)
      Per point of xyz (N, 3), whether the surface z = Z(X, Y) (a regular grid) hides it from the current view: the ray from the point toward the eye passes through the surface.
  cloud(ax, xyz, values=None, color=None, cmap_='seq', s=2.0, depth=True, alpha=0.9, label=None, equal=True)
      A 3D point cloud, coloured by values along a perceptual map or in one colour; nearer points stay darker (depth cue).
  swiss_roll_surface(ax, n=(60, 14), cmap_='soft', points=None, values=None, edge=True)
      The Swiss roll as a lit sheet coloured along the roll, optionally with samples on it.
  equal3d(ax, X, Y, Z, zoom=1.3)
      Equal data aspect for a shape that must not look squashed (a roll, a sphere).
  geodesic(p, q, n=64)
      Points on the great circle from p to q (unit sphere, spherical interpolation).
  sphere(ax, color=None, geodesics=(), points=None, n=64, grid=6, light=(-0.35, -0.55, 0.75), geodesic_colors=None, lw=1.2, labels=None)
      A lit unit sphere (Lambert shading done by hand), faint meridians, and great-circle paths: their near side solid, the far side dashed. geodesics: [(p, q), ...].
Results and Runs:
  bars(ax, values, groups=None, methods=None, errors=None, ours=None, colors=None, hatches=True, labels=True, fmt='{:.1f}', width=0.8, label_size=None, ylim=None, best=None, rotate=None, stars=None, hatch_lw=None)
      Grouped bars: values (methods × groups) or a dict method -> list over groups. Ours (an index or name, or a list for two variants: the accent, then its lighter shade) in the accent, baselines gray, black edges, error bars and value labels above (rotate=None turns them only when they would not fit, False never). hatches: True (each baseline its own), False, a list per method or a dict name -> hatch ("" for none), hatch_lw their line width. best="max"/"min" underlines each group's best. stars: significance brackets, a list of (group, method_a, method_b, p) as in ap.significance.
  significance(ax, pairs, fmt='stars', levels=((0.001, '***'), (0.01, '**'), (0.05, '*')), ns=True, size=None, color=None)
      Significance marks over ap.bars: pairs is a list of (group, a, b, p), or (a, b, p) with one group; a and b are method names or indices, b None marks bar a alone (against a reference named in the caption). p is a number, shown per fmt: "stars", "p" (p = 0.012) or "both", or a string shown as is; ns=False leaves out the non-significant ones. Brackets clear the bars, their error bars and value labels, stack without overlapping, and the y limit grows to hold them.
  stars(p, levels=((0.001, '***'), (0.01, '**'), (0.05, '*')), ns='n.s.')
      The star mark for a p-value: *** p < 0.001, ** p < 0.01, * p < 0.05, else ns ("n.s."). levels=ap.SIG_LEVELS_FINE adds **** for p < 0.0001.
  p_text(p, digits=3)
      p as papers print it: "p < 0.001" below 0.001, else "p = 0.012".
  curves(ax, x, runs, ours=None, colors=None, band='std', lw=1.2, markers=False, smooth=0, every=None, styles=None)
      Mean ± spread curves: runs is a dict method -> array (seeds, len(x)) (or one curve). band std, sem, minmax or None; ours in the accent, drawn last and a bit heavier.
  heat_table(ax, M, rows, cols, fmt='{:.1f}', best='max', axis=0, cmap_='seq', vmin=None, vmax=None, highlight_row=None, size=None)
      A table of numbers as a heat map: tinted cells (shaded per column, or per row with axis=1, darker is better), values printed, the best in bold, ours (highlight_row) named in the accent's ink.
  radar(ax, categories, values, ours=None, colors=None, fill=True, rmax=None, rings=3, lw=1.1, ring_labels=True, fmt='{:g}', reference=None, styles=None)
      A radar chart in a polar panel (kinds={"a": "polar"}): values dict method -> scores per category, ours in the accent and filled (its legend entry a line over the fill), the rest gray outlines with dashes (and markers past four). ring_labels prints the ring values at the clearest angle, over the fills; reference adds dict name -> scores in thin ink (a human or chance level).
  dots(ax, labels, values, errors=None, ours=None, ref=None, fmt=None, xlabel=None)
      A dot-and-whisker chart (ablations, effect sizes): one row per label, the reference value as a thin vertical line.
  read_metrics(path, metric, split=None, step='step')
      (steps, values) of one metric from a Run's metrics.jsonl ({"step", "split", "metrics"} lines, as Aster records them) or any JSON-lines file with flat keys.
  load_runs(groups, metric, split=None, step='step', n=200)
      Several seeds per method on one step grid: groups is a dict name -> [metrics.jsonl, ...]; returns (x, {name: array (seeds, n)}) ready for curves().
4D: a 4th channel, time, slices, projections:
  colorbar(mappable, ax, label=None, ticks=3, where='right', shrink=0.7, fmt=None)
      A compact colour bar for print: thin, 3 ticks, 7 pt, no frame; where="right" or "bottom". ax may be one axes or a list (one bar shared by a grid).
  cloud4d(ax, xyz, values, size_by=None, sizes=(2, 16), cmap_='viridis', label=None, size_label=None, bar=True, alpha=0.9, vmin=None, vmax=None)
      A 3D point cloud whose colour is a 4th variable (a perceptual map and a compact colour bar); size_by adds a 5th as marker area (sizes in pt², a two-entry size key).
  surface4d(ax, X, Y, Z, C, cmap_='viridis', label=None, bar=True, wire=6, vmin=None, vmax=None)
      A surface z = f(x, y) coloured by a 4th field C(x, y) (an uncertainty, a gradient norm), softly lit so its shape still reads, with a compact colour bar for C.
  snapshots3d(axes, frames, times, values=None, cmap_='seq', s=2.2, view=None, label='t', color=None, fmt='%g', box=True)
      Small multiples along t: one 3D cell per frame (each (n, 3)), one view angle and one set of axis limits for all, titled t = ... . values (per frame) colour the points.
  trajectories3d(ax, paths_, times=None, cmap_='viridis', lw=0.8, label='t', bar=True, ends=True, alpha=0.9)
      3D trajectories (array (n, T, 3)) coloured by time along a perceptual map, with a time colour bar; start (open) and end (filled) dots.
  trails(ax, positions, length=10, color=None, lw=1.1, size=7, fade=(0.08, 0.85), head=True)
      Motion trails: points at their last position with a fading history of the previous length frames behind them. positions (T, n, 2) on a 2D axes or (T, n, 3) on a 3D one.
  slices(axes, field, rows, cols, row_label='z', col_label='t', cmap_='viridis', label=None, extent=None, fmt='%g', bar=True)
      A grid of 2D slices through a 3D or 4D field: field[r][c] is the image for row value rows[r] (a z-slice) and column value cols[c] (a time). One colour scale for all, one compact colour bar, rows and columns named on the outer cells only. axes: the grid's axes in row-major order.
  project(X, dims=2)
      PCA of the rows of X (centred): (coordinates (n, dims), explained variance ratios).
  embedding(ax, X, labels=None, values=None, names=None, ours=None, cmap_='viridis', label=None, s=3.0, alpha=0.75, axis_names=True)
      A 2D embedding: X already 2D (t-SNE, UMAP) or projected here by PCA. Colour by a class label (gray classes, ours in the accent, else distinct hues) or by a value such as time (perceptual map and colour bar). Axis names say what the axes are (PC1 (41%)).
  parallel(ax, data, names, groups=None, values=None, ours=None, group_names=None, cmap_='viridis', label=None, alpha=0.45, lw=0.6, log=(), fmt=None)
      Parallel coordinates: one vertical axis per dimension (each scaled to its own range, the range printed at its ends; log lists dimensions on a log scale), one line per row, coloured by group (ours in the accent and drawn last) or by a value (perceptual map, colour bar, the best drawn on top).
`
