// `figures refs --pin` (the person's pinned references first, their own images among them) and the
// reference folder helpers the app calls: listReferenceLibrary and addReferenceImage.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { encodePng } from './research-figures-png.mjs'
import {
  RECIPES,
  addReferenceImage,
  listReferenceLibrary,
  pickReferences
} from './research-figures-refs.mjs'

const run = promisify(execFile)
const CLI = new URL('./cli.mjs', import.meta.url).pathname
const PNG = encodePng(1, 1, [255, 255, 255])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])

async function withProject(work) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-pin-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const library = path.join(project, 'refs-library')
    await mkdir(path.join(library, 'img'), { recursive: true })
    await writeFile(path.join(library, 'img/var.png'), PNG)
    await writeFile(path.join(library, 'img/densenet.png'), PNG)
    await writeFile(path.join(library, 'img/nerf.png'), PNG)
    await writeFile(path.join(library, 'img/my-sketch.png'), PNG)
    await work(project, library)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const refs = (project, library, ...args) =>
  run('node', [CLI, 'figures', 'refs', '--library', library, ...args], {
    cwd: project,
    env: { ...process.env, ASTER_FIGURE_REFERENCES: '' }
  }).then(
    ({ stdout }) => stdout,
    (error) => `${String(error.stdout)}${String(error.stderr)}`
  )

test('a pinned recipe comes first, once, and the picks fill up to the count', async () => {
  await withProject(async (project, library) => {
    const text = 'multi-scale token maps, resolution grows'
    const plain = await pickReferences(project, { text, library })
    const lastPick = plain.picked.at(-1).recipe.id
    const picked = await pickReferences(project, { text, library, pin: [lastPick] })
    assert.equal(picked.picked.length, 3)
    assert.equal(picked.picked[0].recipe.id, lastPick)
    assert.equal(picked.picked[0].pinned, true)
    assert.ok(picked.picked.slice(1).every((entry) => !entry.pinned))
    assert.equal(new Set(picked.picked.map((entry) => entry.recipe.id)).size, 3)
    assert.deepEqual(picked.unknownPins, [])
    const out = await refs(project, library, '--for', text, '--pin', 'densenet')
    assert.match(out, /Pinned by the person: follow one of the pinned references/)
    assert.match(out, /1\. densenet \(pinned\): /)
    assert.equal(out.match(/^\d\. densenet/gm).length, 1)
    assert.match(out, /Look at: .*img\/densenet\.png/)
  })
})

test('the total is the larger of --count and the number of pins, pins in the order given', async () => {
  await withProject(async (project, library) => {
    const picked = await pickReferences(project, {
      text: 'tokens',
      library,
      count: 1,
      pin: ['my-sketch', 'var', 'densenet', 'mamba']
    })
    assert.deepEqual(
      picked.picked.map((entry) => entry.recipe?.id ?? entry.id),
      ['my-sketch', 'var', 'densenet', 'mamba']
    )
    assert.ok(picked.picked.every((entry) => entry.pinned))
  })
})

test("a pinned image of the person's own has no recipe and says how to read it", async () => {
  await withProject(async (project, library) => {
    const picked = await pickReferences(project, { text: 'tokens', library, pin: ['my-sketch'] })
    assert.deepEqual(picked.picked[0], {
      recipe: null,
      id: 'my-sketch',
      image: path.join(library, 'img/my-sketch.png'),
      matched: [],
      score: 0,
      pinned: true
    })
    assert.equal(picked.picked.length, 3)
    const out = await refs(project, library, '--for', 'tokens', '--pin', 'my-sketch')
    assert.match(out, /^1\. my-sketch \(pinned, your own image, no recipe\)$/m)
    assert.match(
      out,
      new RegExp(
        `^ {3}Look at: ${path.join(library, 'img/my-sketch.png').replace(/[/.]/g, '\\$&')}$`,
        'm'
      )
    )
    assert.match(
      out,
      /^ {3}Read its layout skeleton, glyphs, colour roles and emphasis from the image yourself; follow its composition, never its content\.$/m
    )
    // Still the style DNA and the next steps for the recipes after it.
    assert.match(out, /2\. [a-z0-9-]+: /)
    assert.match(out, /Style DNA/)
  })
})

test('a pinned reference left out for this figure stays out, with its reason', async () => {
  await withProject(async (project, library) => {
    const picked = await pickReferences(project, {
      text: 'ray volume rendering',
      library,
      exclude: ['nerf'],
      pin: ['nerf', 'var']
    })
    const ids = picked.picked.map((entry) => entry.recipe?.id)
    assert.ok(!ids.includes('nerf'))
    assert.equal(ids[0], 'var')
    assert.equal(picked.picked.length, 3)
    assert.equal(picked.excluded.get('nerf'), 'asked to leave out')
    const out = await refs(
      project,
      library,
      '--for',
      'ray volume rendering',
      '--exclude',
      'nerf',
      '--pin',
      'nerf,var'
    )
    assert.match(out, /Left out: nerf \(asked to leave out\)/)
    assert.doesNotMatch(out, /^\d\. nerf/m)
    assert.match(out, /1\. var \(pinned\)/)
  })
})

test('a pin that is neither a recipe nor an image in the folder is said so', async () => {
  await withProject(async (project, library) => {
    const picked = await pickReferences(project, { text: 'tokens', library, pin: ['no-such-one'] })
    assert.deepEqual(picked.unknownPins, ['no-such-one'])
    assert.ok(picked.picked.every((entry) => !entry.pinned))
    const out = await refs(project, library, '--for', 'tokens', '--pin', 'no-such-one,my-sketch')
    assert.match(out, /^Pinned no-such-one is not in the reference folder\.$/m)
    assert.match(out, /1\. my-sketch \(pinned, your own image, no recipe\)/)
  })
})

test("--list names the images of the person's own", async () => {
  await withProject(async (project, library) => {
    await writeFile(path.join(library, 'loose-figure.jpg'), JPEG)
    const out = await refs(project, library, '--list')
    assert.match(out, /^Your images \(no recipe\): my-sketch, loose-figure$/m)
    assert.match(out, /^var +/m)
    const bare = path.join(path.dirname(library), 'bare')
    await mkdir(bare)
    assert.doesNotMatch(await refs(project, bare, '--list'), /Your images/)
  })
})

test('listReferenceLibrary lists every recipe with its image, then the images without a recipe', async () => {
  await withProject(async (project, library) => {
    await writeFile(path.join(library, 'loose-figure.jpeg'), JPEG)
    await writeFile(path.join(library, 'notes.txt'), 'not an image')
    await writeFile(path.join(library, 'img/.hidden.png'), PNG)
    await mkdir(path.join(library, 'extra'))
    await writeFile(path.join(library, 'extra/by-index.png'), PNG)
    await writeFile(
      path.join(library, 'refs.json'),
      JSON.stringify({
        figures: [
          {
            name: 'by-index',
            title: 'A paper',
            year: 2024,
            genre: 'agents',
            image: 'extra/by-index.png'
          },
          { name: 'var', image: 'img/var.png' },
          { name: 'lost', image: 'img/lost.png' }
        ]
      })
    )
    const listing = listReferenceLibrary(library)
    assert.equal(listing.dir, library)
    assert.equal(listing.exists, true)
    const recipes = listing.entries.filter((entry) => entry.recipe)
    assert.deepEqual(
      recipes.map((entry) => entry.id),
      RECIPES.map((recipe) => recipe.id)
    )
    assert.equal(
      recipes.find((entry) => entry.id === 'var').image,
      path.join(library, 'img/var.png')
    )
    assert.equal(recipes.find((entry) => entry.id === 'mamba').image, null)
    assert.equal(
      recipes.find((entry) => entry.id === 'var').year,
      RECIPES.find((recipe) => recipe.id === 'var').year
    )
    const own = listing.entries.filter((entry) => !entry.recipe)
    assert.deepEqual(
      own.map((entry) => entry.id),
      ['by-index', 'my-sketch', 'loose-figure']
    )
    assert.deepEqual(own[0], {
      id: 'by-index',
      image: path.join(library, 'extra/by-index.png'),
      title: 'A paper',
      year: 2024,
      genre: 'agents',
      recipe: false
    })
    assert.deepEqual(
      [own[1].title, own[1].year, own[1].genre, own[2].image],
      [null, null, null, path.join(library, 'loose-figure.jpeg')]
    )
    // The recipes come before the images of the person's own.
    assert.deepEqual(
      listing.entries.map((entry) => entry.recipe),
      [...recipes.map(() => true), ...own.map(() => false)]
    )
  })
})

test('listReferenceLibrary without a folder still lists the recipes, with no images', () => {
  for (const dir of [path.join(os.tmpdir(), 'aster-no-such-reference-folder'), null]) {
    const listing = listReferenceLibrary(dir)
    assert.equal(listing.exists, false)
    assert.equal(listing.entries.length, RECIPES.length)
    assert.ok(listing.entries.every((entry) => entry.recipe && entry.image === null))
  }
})

test('addReferenceImage saves a PNG or JPEG as img/<id> with a clean, unique id', async () => {
  await withProject(async (project, library) => {
    const added = await addReferenceImage(
      library,
      'Café Figure (final).PNG',
      PNG.toString('base64')
    )
    assert.deepEqual(added, {
      id: 'cafe-figure-final',
      image: path.join(library, 'img/cafe-figure-final.png')
    })
    assert.deepEqual(await readFile(added.image), PNG)
    const second = await addReferenceImage(library, 'cafe figure final.png', PNG.toString('base64'))
    assert.equal(second.id, 'cafe-figure-final-2')
    const third = await addReferenceImage(
      library,
      'cafe-figure-final',
      `data:image/png;base64,${PNG.toString('base64')}`
    )
    assert.equal(third.id, 'cafe-figure-final-3')
    const jpeg = await addReferenceImage(library, 'photo.jpg', JPEG.toString('base64'))
    assert.equal(jpeg.image, path.join(library, 'img/photo.jpg'))
    // The type comes from the bytes, not the name.
    assert.equal(
      (await addReferenceImage(library, 'really-a-png.jpg', PNG.toString('base64'))).image,
      path.join(library, 'img/really-a-png.png')
    )
    assert.equal(
      (await addReferenceImage(library, '그림.png', PNG.toString('base64'))).id,
      'reference'
    )
    assert.equal(
      (await addReferenceImage(library, '그림.png', PNG.toString('base64'))).id,
      'reference-2'
    )
    const long = await addReferenceImage(library, `${'a'.repeat(100)}.png`, PNG.toString('base64'))
    assert.equal(long.id.length, 60)
    // A new folder is made, and an id equal to a recipe's becomes that recipe's image.
    const fresh = path.join(project, 'new-folder')
    const named = await addReferenceImage(fresh, 'Mamba.png', PNG.toString('base64'))
    assert.equal(named.id, 'mamba')
    const listing = listReferenceLibrary(fresh)
    assert.equal(listing.entries.find((entry) => entry.id === 'mamba').image, named.image)
    assert.ok(listing.entries.every((entry) => entry.recipe))
  })
})

test('addReferenceImage refuses anything that is not a PNG or JPEG, or over 20 MB', async () => {
  await withProject(async (project, library) => {
    for (const bytes of [Buffer.from('<svg></svg>'), Buffer.from('GIF89a....'), Buffer.alloc(0)]) {
      await assert.rejects(
        addReferenceImage(library, 'x.png', bytes.toString('base64')),
        /^Error: Only PNG or JPEG images can be references\.$/
      )
    }
    const big = Buffer.concat([PNG, Buffer.alloc(20 * 1024 * 1024)])
    await assert.rejects(
      addReferenceImage(library, 'big.png', big.toString('base64')),
      /at most 20 MB/
    )
    assert.deepEqual(
      listReferenceLibrary(library)
        .entries.filter((entry) => !entry.recipe)
        .map((entry) => entry.id),
      ['my-sketch']
    )
  })
})
