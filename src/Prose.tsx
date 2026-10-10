'use client'

// WHAT A MESSAGE LOOKS LIKE. `lib/prose.ts` reads a turn's markdown into
// tokens and this sets each one in a gui element, so the type, the gaps, the
// code panel and the table are props on the element that draws them. Nothing
// reaches in by tag, so nothing can collide with another sheet's `.prose`.
//
// No markup is made from the text: every leaf is a string React escapes, a
// link carries only the href `destination` allows, and an image is its alt.

import type { ReactNode } from 'react'
import { Anchor, Text, View, XStack, YStack } from '@hanzo/gui'
import { Code } from '@hanzo/ui/chat'
import { destination, read, type Token, type Tokens } from './lib/prose'

const INK = 'var(--foreground)'
const QUIET = 'var(--muted-foreground)'
const EDGE = 'var(--border)'
const GROUND = 'var(--secondary)'
type Tone = typeof INK | typeof QUIET

/** A heading's rung, by depth: one step down the type ramp per level. */
const RUNG = ['$6', '$4', '$3', '$2', '$2', '$2'] as const
type Rung = (typeof RUNG)[number]

/** The character references a model writes, as the characters they name. An
 *  HTML renderer let the browser decode `&amp;`; a string React sets is shown
 *  exactly as written. */
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string): string =>
  s.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]+));/gi, (all, hex, dec, name) => {
    if (hex || dec) {
      const n = hex ? parseInt(hex, 16) : Number(dec)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all
    }
    return NAMED[name.toLowerCase()] ?? all
  })

/** One run of inline tokens, in `tone`, at the block's `rung`. */
function inline(tokens: Token[] | undefined, tone: Tone, rung: Rung = '$2'): ReactNode[] {
  return (tokens ?? []).map((t, i) => {
    switch (t.type) {
      case 'strong':
        return (
          <Text key={i} render="strong" color={tone} fontWeight="600">
            {inline(t.tokens, tone, rung)}
          </Text>
        )
      case 'em':
        return (
          <Text key={i} render="em" color={tone} fontStyle="italic">
            {inline(t.tokens, tone, rung)}
          </Text>
        )
      case 'del':
        return (
          <Text key={i} render="del" color={tone} textDecorationLine="line-through" opacity={0.7}>
            {inline(t.tokens, tone, rung)}
          </Text>
        )
      case 'codespan':
        return (
          <Text key={i} render="code" color={tone} fontFamily="$mono" fontSize="$1" px="$1" rounded={4} bg={GROUND}>
            {decode(t.text)}
          </Text>
        )
      case 'br':
        return <br key={i} />
      case 'link': {
        const to = destination(t.href)
        if (!to) return inline(t.tokens, tone, rung)
        // AWAY IS A NEW TAB, HOME IS NOT. Someone else's page opened from a
        // message never gets a handle on this one and never inherits the
        // referrer; a link back into this app is a link.
        return (
          <Anchor
            key={i}
            href={to.href}
            {...(to.away ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
            {...(t.title ? { title: t.title } : {})}
            size={rung}
            color={INK}
            textDecorationLine="underline"
          >
            {inline(t.tokens, INK, rung)}
          </Anchor>
        )
      }
      // An image is a fetch to wherever the message says, which is a reader's
      // address leaking to whoever wrote it. The alt text is the message.
      case 'image':
        return decode(t.text)
      // Raw HTML in a message is text somebody typed, shown as what it is.
      case 'html':
        return t.text
      case 'text':
        return 'tokens' in t && t.tokens ? inline(t.tokens, tone, rung) : decode(t.text)
      default:
        return 'text' in t ? decode(String(t.text)) : null
    }
  })
}

/** Running text: a paragraph, or a list item's own words. */
function Line({ tokens, tone }: { tokens: Token[] | undefined; tone: Tone }) {
  return (
    <Text render="p" color={tone} fontSize="$2" lineHeight="$3">
      {inline(tokens, tone)}
    </Text>
  )
}

function List({ list, tone }: { list: Tokens.List; tone: Tone }) {
  const start = typeof list.start === 'number' ? list.start : 1
  return (
    <YStack render={list.ordered ? 'ol' : 'ul'} m={0} p={0} gap="$1">
      {list.items.map((item, i) => (
        <XStack key={i} render="li" gap="$1">
          <Text aria-hidden color={tone} fontSize="$2" lineHeight="$3" minW={14} text="right">
            {item.task ? (item.checked ? '☑' : '☐') : list.ordered ? `${start + i}.` : '•'}
          </Text>
          <YStack flex={1} minW={0} gap="$1">
            {blocks(item.tokens, tone)}
          </YStack>
        </XStack>
      ))}
    </YStack>
  )
}

/** A table is a grid: one track per column, as wide as what the column holds,
 *  in a box that scrolls sideways rather than widening the message. Cells
 *  share an edge by drawing their right and bottom ones; the first row adds
 *  the top and the first column the left. */
function Table({ table, tone }: { table: Tokens.Table; tone: Tone }) {
  const align = (c: number) => table.align[c] ?? 'left'
  return (
    <View role="table" display="grid" gridTemplateColumns={`repeat(${table.header.length}, max-content)`} self="flex-start" maxW="100%" overflowX="auto">
      {[table.header, ...table.rows].map((row, r) => (
        <View key={r} role="row" display="contents">
          {row.map((cell, c) => (
            <Text
              key={c}
              role={r ? 'cell' : 'columnheader'}
              color={tone}
              fontSize="$2"
              lineHeight="$3"
              fontWeight={r ? '400' : '600'}
              text={align(c)}
              px="$2"
              py="$1"
              bg={r ? undefined : GROUND}
              borderColor={EDGE}
              borderStyle="solid"
              borderRightWidth={1}
              borderBottomWidth={1}
              borderTopWidth={r ? 0 : 1}
              borderLeftWidth={c ? 0 : 1}
            >
              {inline(cell.tokens, tone)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

/** A run of block tokens. A tight list item's words arrive as a `text` block. */
function blocks(tokens: Token[] | undefined, tone: Tone): ReactNode[] {
  return (tokens ?? []).map((t, i) => {
    switch (t.type) {
      case 'paragraph':
        return <Line key={i} tokens={t.tokens} tone={tone} />
      case 'text':
        return <Line key={i} tokens={'tokens' in t && t.tokens ? t.tokens : [t]} tone={tone} />
      case 'heading':
        return (
          <Text key={i} render={`h${t.depth}` as 'h1'} m={0} color={tone} fontSize={RUNG[t.depth - 1]} lineHeight={RUNG[t.depth - 1]} fontWeight="600">
            {inline(t.tokens, tone, RUNG[t.depth - 1])}
          </Text>
        )
      case 'list':
        return <List key={i} list={t as Tokens.List} tone={tone} />
      case 'table':
        return <Table key={i} table={t as Tokens.Table} tone={tone} />
      // A fenced block is @hanzo/ui's `Code`, the frame Dev's answers draw:
      // its language, a copy control, and a body that scrolls SIDEWAYS on its
      // own, because wrapping code changes what it says.
      case 'code':
        return (
          <Code key={i} language={(t as Tokens.Code).lang || 'text'} value={t.text}>
            {t.text}
          </Code>
        )
      case 'blockquote':
        return (
          <YStack key={i} render="blockquote" m={0} pl="$3" gap="$2" borderWidth={0} borderLeftWidth={2} borderStyle="solid" borderColor={EDGE}>
            {blocks(t.tokens, QUIET)}
          </YStack>
        )
      case 'hr':
        return <View key={i} render="hr" m={0} height={0} borderWidth={0} borderTopWidth={1} borderStyle="solid" borderColor={EDGE} />
      case 'html':
        return <Line key={i} tokens={[t]} tone={tone} />
      default:
        return null
    }
  })
}

/** One message's markdown, drawn. Empty in, nothing out — a streaming turn
 *  asks on every token and the first is nothing. */
export function Prose({ text }: { text: string }) {
  if (!text) return null
  return (
    <YStack data-slot="prose" gap="$2" minW={0}>
      {blocks(read(text), INK)}
    </YStack>
  )
}
