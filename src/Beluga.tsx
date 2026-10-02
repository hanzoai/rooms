'use client'

/**
 * Beluga Fullscreen Ocean AI Studio
 *
 * Built with @hanzo/gui native components and responsive CSS Grid:
 * - Desktop (>= 1440px) / Laptop (1024px - 1439px): 3-column grid (Left Prompts, Center Ocean Canvas, Right Telemetry)
 * - Tablet (768px - 1023px): 2-column grid (Center Ocean Canvas + Right Telemetry)
 * - Mobile (< 768px): 1-column grid with touch drawers
 *
 * Uses @hanzo/gui native components exclusively (View, XStack, YStack, Text, Button, etc.).
 */

import React, { useState, useEffect } from 'react'
import { useRooms } from './host'
import {
  Send,
  Bot,
  Sparkles,
  Volume2,
  VolumeX,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  ArrowUp,
  Activity,
  Shield,
  Zap,
  Radio,
  Sliders,
  Menu,
} from 'lucide-react'
import { View, XStack, YStack, Text, Button } from '@hanzo/gui'
import { bearer, scope } from './lib/session'
import { api } from './lib/api'
import { Orgs } from './Orgs'
import { mix } from './lib/mix'

const EMOTIONS: Record<string, { name: string; emoji: string; desc: string }> = {
  happy: { name: 'Happiness', emoji: '😊', desc: 'Joyful bright clicks and radiant ocean bubbles.' },
  playful: { name: 'Playful', emoji: '🐬', desc: 'Playful spiraling swim with rhythmic echolocation pulses.' },
  love: { name: 'Love', emoji: '💙', desc: 'Deep empathetic resonance and social connection.' },
  curious: { name: 'Curiosity', emoji: '🤔', desc: 'Curious sonar ping focused on analyzing data.' },
  calm: { name: 'Calmness', emoji: '🌊', desc: 'Tranquil resting glide through deep arctic currents.' },
  awe: { name: 'Awe', emoji: '🌟', desc: 'Wide acoustic aperture detecting novel patterns.' },
}

const QUICK_PROMPTS = [
  'Origin Eggs 🥚',
  'Endangered Species 🐅',
  'ZenLM Neural AI 🧠',
]

const IDLE_THOUGHTS = [
  'Did you know belugas use echolocation to navigate underwater caves? 🐬',
  'I am ready when you are! Ask me anything about Hanzo Cloud or conservation! ✨',
  'The ocean is calm today... What shall we build or discover? 🌊',
  'Echolocation ping sent! Waiting for your signal... 📡',
  'Hatching an Origin Egg sounds exciting today! 🥚',
]

/** The room's dark glass: the canvas shows through blurred, under a lit top
 *  edge and a soft drop. The fill is each surface's own. */
const LENS = {
  backdropFilter: 'blur(24px) saturate(190%) contrast(102%)',
  boxShadow:
    'inset 0 1px 0 0 var(--white-14), inset 0 0 0 1px var(--white-03), 0 8px 32px -4px color-mix(in srgb, var(--pure-black) 40%, transparent)',
} as const
/** The ground under the lens: the page's darkest neutral at a share of itself. */
const glass = (share: number) => mix('var(--neutral-950)', share, 'srgb')

function BelugaStudioInner() {
  const { Link } = useRooms()
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [muted, setMuted] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState('playful')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [idleThought, setIdleThought] = useState(IDLE_THOUGHTS[0])
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'prompts' | 'telemetry'>('none')

  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      content:
        'Hello! I am Blue the Beluga, powered by ZenLM on the Hanzo Cloud. How can I assist your team with agentic coding, conservation, or ocean acoustics today?',
      emotion: 'playful',
    },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * IDLE_THOUGHTS.length)
      setIdleThought(IDLE_THOUGHTS[idx])
    }, 12000)
    return () => clearInterval(interval)
  }, [])

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)

    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      emotion: 'curious',
    }

    setMessages((prev) => [...prev, userMsg])

    const nextEmotion = text.toLowerCase().includes('egg')
      ? 'curious'
      : text.toLowerCase().includes('build') || text.toLowerCase().includes('code')
      ? 'awe'
      : 'happy'

    setCurrentEmotion(nextEmotion)

    try {
      const tok = bearer()
      const res = await fetch(`${api()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? scope() : {}),
        },
        body: JSON.stringify({
          model: 'zen',
          messages: [
            {
              role: 'system',
              content:
                "You are Blue the Beluga, Hanzo's bioacoustic ocean AI and neural sonar intelligence agent. You provide ocean telemetry and marine analysis. Always start with a brief italicized acoustic sensory description like *high-frequency clicks* or *curious sonar whistle* reflecting the mood.",
            },
            ...messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: text },
          ],
        }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; msg?: string }
        throw new Error(body?.error?.message || body?.msg || `Cluster returned HTTP ${res.status}`)
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const reply = data?.choices?.[0]?.message?.content
      if (!reply) throw new Error('The model returned an empty reply.')

      const botMsg = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: reply,
        emotion: nextEmotion,
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const botMsg = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: `*Acoustic cluster refraction*\n\n${message}`,
        emotion: 'curious',
      }
      setMessages((prev) => [...prev, botMsg])
    } finally {
      setBusy(false)
      setMobileDrawer('none')
    }
  }

  return (
    <YStack
      data-beluga
      flex={1}
      minH={0}
      height="100vh"
      width="100%"
      maxW="100%"
      overflowX="auto"
      overflowY="hidden"
      bg="var(--pure-black)"
      pb={56}
    >
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <XStack
        height={50}
        items="center"
        justify="space-between"
        px="$3.5"
        borderBottomWidth={1}
        borderColor="var(--white-08)"
        bg="var(--neutral-950)"
        z={30}
        shrink={0}
      >
        <XStack items="center" gap="$2.5">
          <Link href="/vibe">
            <XStack
              items="center"
              justify="center"
              width={28}
              height={28}
              rounded={8}
              bg="var(--neutral-900)"
              borderWidth={1}
              borderColor="var(--white-10)"
              hoverStyle={{ bg: 'var(--neutral-800)' }}
            >
              <ArrowLeft size={14} color="var(--neutral-400)" />
            </XStack>
          </Link>
          <XStack items="center" gap="$2">
            <Bot size={15} color="$ink" />
            <Text render="h1" fontSize="$2" fontWeight="700" color="var(--pure-white)">
              Blue the Beluga
            </Text>
            <Text fontSize={11} color="var(--neutral-600)">
              |
            </Text>
            <Text fontSize={11} color="var(--neutral-400)">
              ZenLM Neural Studio
            </Text>
          </XStack>
        </XStack>

        <XStack items="center" gap="$2">
          {/* Mobile Drawer Triggers */}
          <XStack $md={{ display: 'none' }} gap="$1.5">
            <Button
              size="$2"
              height={28}
              px="$2"
              rounded={6}
              bg={mobileDrawer === 'prompts' ? 'var(--neutral-800)' : 'var(--neutral-900)'}
              onPress={() => setMobileDrawer(mobileDrawer === 'prompts' ? 'none' : 'prompts')}
            >
              <Sparkles size={12} color="$ink" />
            </Button>
            <Button
              size="$2"
              height={28}
              px="$2"
              rounded={6}
              bg={mobileDrawer === 'telemetry' ? 'var(--neutral-800)' : 'var(--neutral-900)'}
              onPress={() => setMobileDrawer(mobileDrawer === 'telemetry' ? 'none' : 'telemetry')}
            >
              <Activity size={12} color="$ink" />
            </Button>
          </XStack>

          <View
            cursor="pointer"
            onPress={() => setMuted(!muted)}
            p={6}
            rounded={8}
            bg="var(--neutral-900)"
            borderWidth={1}
            borderColor="var(--white-08)"
            hoverStyle={{ bg: 'var(--neutral-800)' }}
          >
            {muted ? <VolumeX size={14} color="var(--neutral-400)" /> : <Volume2 size={14} color="var(--neutral-400)" />}
          </View>

          <Button
            display="none"
            $md={{ display: 'flex' }}
            size="$2"
            height={28}
            px="$3"
            rounded={8}
            bg="var(--neutral-900)"
            borderColor="var(--white-10)"
            borderWidth={1}
            onPress={() => setRightOpen(!rightOpen)}
          >
            <XStack items="center" gap="$1.5">
              <Activity size={12} color="$ink" />
              <Text fontSize={11} fontWeight="600" color="var(--neutral-200)">
                Telemetry
              </Text>
            </XStack>
          </Button>
        </XStack>
      </XStack>

      {/* ── Main Studio: Responsive CSS Grid ──────────────────────────────── */}
      <View
        flex={1}
        minH={0}
        width="100%"
        height="100%"
        overflow="hidden"
        display="grid"
        gridTemplateRows="100%"
        gridTemplateColumns="100%"
        $md={{ gridTemplateColumns: 'minmax(0, 1fr) 280px' }}
        $lg={{ gridTemplateColumns: '280px minmax(0, 1fr) 280px' }}
      >
        {/* ── Column 1: Left Quick Prompts Sidebar ─────────────────────────── */}
        <YStack
          height="100%"
          bg="var(--neutral-950)"
          borderRightWidth={1}
          borderColor="var(--white-08)"
          minW={0}
          display={mobileDrawer === 'prompts' ? 'flex' : 'none'}
          $max-md={{ position: 'absolute', t: 0, r: 0, b: 0, l: 0, z: 'var(--z-dock)' }}
          $md={{ display: 'none' }}
          $lg={{ display: 'flex' }}
        >
          <XStack
            height={40}
            items="center"
            justify="space-between"
            px="$3.5"
            borderBottomWidth={1}
            borderColor="var(--white-06)"
          >
            <Text fontSize={11} fontWeight="700" color="var(--neutral-500)" textTransform="uppercase">
              Quick Ocean Prompts
            </Text>
          </XStack>

          <YStack flex={1} overflow="scroll" p="$3.5" gap="$4">
            <YStack gap="$1.5">
              {QUICK_PROMPTS.map((p, i) => (
                <View
                  key={i}
                  cursor="pointer"
                  onPress={() => handleSend(p)}
                  p="$2.5"
                  rounded={8}
                  bg="var(--neutral-900)"
                  borderWidth={1}
                  borderColor="var(--white-06)"
                  hoverStyle={{ bg: 'var(--neutral-800)' }}
                >
                  <Text fontSize={12} color="var(--neutral-300)">
                    {p}
                  </Text>
                </View>
              ))}
            </YStack>

            <YStack
              p="$3"
              rounded={12}
              bg="var(--white-08)"
              borderWidth={1}
              borderColor="var(--white-20)"
              gap="$1.5"
            >
              <XStack items="center" gap="$1.5">
                <Sparkles size={13} color="$ink" />
                <Text fontSize={11} fontWeight="700" color="$ink">
                  Ocean Thought
                </Text>
              </XStack>
              <Text fontSize={11} color="var(--neutral-300)" lineHeight={16}>
                {idleThought}
              </Text>
            </YStack>
          </YStack>
        </YStack>

        {/* ── Column 2: Center Ocean Neural Avatar Canvas ───────────────────── */}
        <YStack
          height="100%"
          bg="var(--pure-black)"
          position="relative"
          items="center"
          justify="space-between"
          p="$4"
          minW={0}
        >
          {/* Avatar Canvas */}
          <YStack flex={1} items="center" justify="center" width="100%">
            <YStack
              width={220}
              height={220}
              rounded={110}
              borderWidth={1}
              borderColor="var(--white-30)"
              items="center"
              justify="center"
              shadowColor="var(--white-20)"
              shadowRadius={50}
            >
              <Text fontSize={72}>🐬</Text>
            </YStack>

            {/* Subtitles stream */}
            <View
              {...LENS}
              mt="$4"
              maxW={520}
              width="100%"
              px="$3.5"
              py="$2.5"
              rounded={14}
              bg={glass(85)}
              borderWidth={1}
              borderColor="var(--white-10)"
            >
              <Text
                fontSize={12}
                color="var(--neutral-200)"
                text="center"
                fontFamily="$mono"
                lineHeight={18}
              >
                {messages[messages.length - 1]?.content}
              </Text>
            </View>
          </YStack>

          {/* Floating Neural Prompt Composer */}
          <YStack width="100%" maxW={600} z={20}>
            <XStack
              {...LENS}
              items="center"
              bg={glass(90)}
              borderWidth={1}
              borderColor="var(--white-14)"
              rounded={14}
              p="$2"
            >
              <Text
                render={
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask Blue the Beluga anything or send acoustic signal..."
                  />
                }
                flex={1}
                bg="transparent"
                borderWidth={0}
                color="var(--pure-white)"
                fontSize="$2"
                outlineStyle="none"
                px={10}
                py={4}
              />
              <Button
                size="$2"
                bg="var(--neutral-50)"
                rounded={10}
                height={30}
                px="$2.5"
                onPress={() => handleSend()}
                disabled={!input.trim() || busy}
                opacity={!input.trim() || busy ? 0.3 : 1}
                hoverStyle={{ bg: 'var(--neutral-200)' }}
              >
                <ArrowUp size={14} color="var(--neutral-950)" />
              </Button>
            </XStack>
          </YStack>
        </YStack>

        {/* ── Column 3: Right Bioacoustic Telemetry & Emotions ─────────────── */}
        <YStack
          height="100%"
          bg="var(--neutral-950)"
          borderLeftWidth={1}
          borderColor="var(--white-08)"
          minW={0}
          display={mobileDrawer === 'telemetry' ? 'flex' : 'none'}
          $max-md={{ position: 'absolute', t: 0, r: 0, b: 0, l: 0, z: 'var(--z-dock)' }}
          $md={{ display: 'flex' }}
        >
          <XStack
            height={40}
            items="center"
            justify="space-between"
            px="$3.5"
            borderBottomWidth={1}
            borderColor="var(--white-06)"
          >
            <XStack items="center" gap="$2">
              <Activity size={14} color="$ink" />
              <Text fontSize={12} fontWeight="600" color="var(--neutral-200)">
                Bioacoustic Telemetry
              </Text>
            </XStack>
            <View
              px={6}
              py={2}
              rounded={4}
              bg="var(--white-15)"
            >
              <Text fontSize={10} color="$ink" fontFamily="$mono" fontWeight="600">
                120 kHz
              </Text>
            </View>
          </XStack>

          <YStack flex={1} overflow="scroll" p="$3.5" gap="$4">
            <YStack gap="$2">
              <Text fontSize={10} fontWeight="700" color="var(--neutral-500)" textTransform="uppercase">
                Active Emotion State
              </Text>
              <YStack
                p="$3"
                rounded={12}
                bg="var(--neutral-900)"
                borderWidth={1}
                borderColor="var(--white-06)"
                gap="$1"
              >
                <XStack items="center" gap="$2">
                  <Text fontSize={15}>{EMOTIONS[currentEmotion]?.emoji}</Text>
                  <Text fontSize={13} fontWeight="700" color="var(--pure-white)">
                    {EMOTIONS[currentEmotion]?.name}
                  </Text>
                </XStack>
                <Text fontSize={11} color="var(--neutral-400)" lineHeight={16}>
                  {EMOTIONS[currentEmotion]?.desc}
                </Text>
              </YStack>
            </YStack>

            <YStack gap="$2">
              <Text fontSize={10} fontWeight="700" color="var(--neutral-500)" textTransform="uppercase">
                Emotion State Matrix
              </Text>
              <YStack gap="$1.5">
                {Object.entries(EMOTIONS).map(([key, item]) => (
                  <View
                    key={key}
                    cursor="pointer"
                    onPress={() => setCurrentEmotion(key)}
                    px="$2.5"
                    py="$2"
                    rounded={8}
                    borderWidth={1}
                    borderColor={
                      currentEmotion === key ? 'var(--white-40)' : 'var(--white-06)'
                    }
                    bg={
                      currentEmotion === key ? 'var(--white-14)' : 'var(--neutral-900)'
                    }
                  >
                    <XStack items="center" justify="space-between">
                      <XStack items="center" gap="$2">
                        <Text fontSize={13}>{item.emoji}</Text>
                        <Text
                          fontSize={12}
                          fontWeight={currentEmotion === key ? '700' : '400'}
                          color={currentEmotion === key ? 'var(--pure-white)' : 'var(--neutral-300)'}
                        >
                          {item.name}
                        </Text>
                      </XStack>
                      {currentEmotion === key && (
                        <View width={6} height={6} rounded={3} bg="var(--pure-white)" />
                      )}
                    </XStack>
                  </View>
                ))}
              </YStack>
            </YStack>
          </YStack>
        </YStack>
      </View>
    </YStack>
  )
}

// THE GATE IS NOT A ROOM'S TO REMEMBER. This room draws its own shell rather
// than `Room`, which is where every other room picks the organization gate up —
// so it was reachable, and usable, by an account that had never paid. Wrapping
// the export means the route cannot mount the room without it.
export function BelugaStudio() {
  return (
    <Orgs>
      <BelugaStudioInner />
    </Orgs>
  )
}
