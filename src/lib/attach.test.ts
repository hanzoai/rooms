import { describe, expect, test } from 'vitest'
import { compose, images, kindOf, partsOf, type Held } from './attach'

const held = (name: string, kind: Held['kind'], data: string): Held => ({ id: name, name, kind, data, size: data.length })

describe('attach', () => {
  test('an image rides as a picture, a text file as its words, anything else is refused', () => {
    expect(kindOf({ name: 'a.png', type: 'image/png' })).toBe('image')
    expect(kindOf({ name: 'notes.md', type: '' })).toBe('text')
    expect(kindOf({ name: 'data.json', type: 'application/json' })).toBe('text')
    expect(kindOf({ name: 'deck.pdf', type: 'application/pdf' })).toBeNull()
  })

  test('the message carries each text file fenced under its name, and the images apart', () => {
    const files = [held('a.ts', 'text', 'const a = 1\n'), held('b.png', 'image', 'data:image/png;base64,AA==')]
    expect(compose('look at this', files)).toBe('look at this\n\na.ts\n```\nconst a = 1\n```')
    expect(images(files)).toEqual(['data:image/png;base64,AA=='])
    expect(compose('', [files[1]])).toBe('b.png')
  })

  test('a file holding a fence cannot close the one around it', () => {
    expect(compose('', [held('r.md', 'text', 'x\n```js\ny\n```')])).toBe('r.md\n````\nx\n```js\ny\n```\n````')
  })

  test('a wire turn draws its words and its pictures', () => {
    expect(partsOf([{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'data:x' } }])).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'image', url: 'data:x', alt: 'Attached image' },
    ])
  })
})
