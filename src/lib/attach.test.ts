import { describe, expect, test } from 'vitest'
import { admit, compose, images, kindOf, partsOf, TEXT_MAX, type Going } from './attach'

const going = (name: string, kind: Going['kind'], data: string): Going => ({ name, kind, data })

describe('attach', () => {
  test('an image rides as a picture, a text file as its words, anything else is refused', () => {
    expect(kindOf({ name: 'a.png', type: 'image/png' })).toBe('image')
    expect(kindOf({ name: 'notes.md', type: '' })).toBe('text')
    expect(kindOf({ name: 'data.json', type: 'application/json' })).toBe('text')
    expect(kindOf({ name: 'deck.pdf', type: 'application/pdf' })).toBeNull()
  })

  test('a refused file is named, by kind and by size, before anything is read', async () => {
    expect(await admit(new File(['%PDF'], 'deck.pdf', { type: 'application/pdf' }))).toBe(
      'deck.pdf: only images and text files go with a message.',
    )
    expect(await admit(new File(['x'.repeat(TEXT_MAX + 1)], 'big.txt', { type: 'text/plain' }))).toBe(
      'big.txt is larger than 256 KB.',
    )
  })

  test('the message carries each text file fenced under its name, and the images apart', () => {
    const files = [going('a.ts', 'text', 'const a = 1\n'), going('b.png', 'image', 'data:image/png;base64,AA==')]
    expect(compose('look at this', files)).toBe('look at this\n\n```a.ts\nconst a = 1\n```')
    expect(images(files)).toEqual(['data:image/png;base64,AA=='])
    expect(compose('', [files[1]])).toBe('b.png')
  })

  test('a file holding a fence cannot close the one around it', () => {
    expect(compose('', [going('r.md', 'text', 'x\n```js\ny\n```')])).toBe('````r.md\nx\n```js\ny\n```\n````')
  })

  test('a wire turn draws its words and its pictures', () => {
    expect(partsOf([{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'data:x' } }])).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'image', url: 'data:x', alt: 'Attached image' },
    ])
  })
})
