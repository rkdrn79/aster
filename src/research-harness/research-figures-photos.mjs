// The CC0 photographs vendored under vendor/photos (sources and authors in SOURCES.json), used as
// thumbnails when a project has no images of its own.

export const PHOTO_KINDS = [
  'cat',
  'dog',
  'bird',
  'street',
  'landscape',
  'beach',
  'kitchen',
  'robot',
  'car',
  'food',
  'flower',
  'building'
]

// Why: names from before the photos keep working.
export const PHOTO_ALIASES = { arm: 'robot' }

/** The photo kind a picture kind uses, or null for the generated ones (noise, gradient). */
export function photoKind(kind) {
  const name = PHOTO_ALIASES[kind] ?? kind
  return PHOTO_KINDS.includes(name) ? name : null
}

/** What each photo shows, so a caption names it right (and a view crops to its subject). */
export const PHOTO_NOTES = {
  cat: 'close-up of a gray tabby cat’s face on grass; fills the frame',
  dog: 'a small brown dog standing on a snowy ridge, blue mountains behind; the dog is small (view: { x: 0.3, y: 0.35, w: 0.35, h: 0.45 } zooms in)',
  bird: 'a blue-and-orange kingfisher on a branch, plain beige background',
  street: 'a city street corner: a glass subway entrance, apartment blocks, trees',
  landscape: 'green forested hills under a gray cloudy sky',
  beach: 'a sandy beach from above with rows of straw parasols, the sea at the top',
  kitchen: 'a home kitchen: wooden cabinets, shelves and appliances',
  robot: 'an industrial robot arm in a cluttered workshop with shelves (also kind: arm)',
  car: 'black-and-white close-up of a vintage car’s fender and headlamp, not a whole car',
  food: 'four square baked cakes on a red lacquer tray, from above',
  flower: 'a pale butterfly on a yellow marigold, green background',
  building: 'a large apartment block’s facade: rows of windows, a texture more than a scene'
}

/** `figures kit image`: the photo kinds and what each shows. */
export function photoListText() {
  return [
    '',
    'Photo kinds (CC0; vendor/photos/SOURCES.json) and what each shows:',
    ...PHOTO_KINDS.map((kind) => `  ${kind.padEnd(10)} ${PHOTO_NOTES[kind]}`),
    '  noise, gradient  generated: diffusion noise (tint colours it), a smooth gradient'
  ].join('\n')
}
