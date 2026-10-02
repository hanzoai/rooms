'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Copy,
  Check,
  Plus,
  Calendar,
  ExternalLink,
  Bot,
  Volume2,
  Square,
  Send,
  UserPlus,
  Tv,
  LayoutGrid,
  ArrowRight,
} from 'lucide-react'
import { Text, View, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { useIamToken } from '@hanzo/iam/react'
import { REFUSED, speech, useVoice } from '@hanzo/voice'
import { Face, voiceOf } from './cast'
import { member } from './team'
import { cleanForSpeech, speakAgent, stopAgentSpeech, AudioWave, useAgentSpeech } from './speech'
import { GOOD } from './lib/mix'
import { api } from './lib/api'
import { ENSO, base } from './lib/ai'

export interface MeetingAgent {
  id: string
  name: string
  role: string
  voice: string
}

/** A core member as a meeting seats them: the team's name and part, the cast's voice. */
const seated = (id: string): MeetingAgent => {
  const one = member(id)!
  return { id, name: one.name, role: one.role, voice: voiceOf(id) }
}

export const AVAILABLE_MEETING_AGENTS: MeetingAgent[] = [
  { id: 'hanzo-coder', name: 'Hanzo Coder', role: 'Engineering Lead & Coder', voice: voiceOf('Hanzo Coder') },
  { id: 'hanzo-researcher', name: 'Hanzo Researcher', role: 'Research & DeSci Scientist', voice: voiceOf('Hanzo Researcher') },
  seated('maya'),
  seated('des'),
  seated('vi'),
  seated('nora'),
  seated('einstein'),
  { id: 'zach', name: 'Zach', role: 'Quantitative Analyst', voice: voiceOf('zach') },
]

interface ScheduledMeeting {
  id: string
  title: string
  roomName: string
  time: string
  date: string
  duration: string
  host: string
  participants: string[]
  agents: string[]
  botInvited: boolean
  url: string
}

const DEFAULT_MEETINGS: ScheduledMeeting[] = [
  {
    id: 'meet-1',
    title: 'AI Platform Architecture & LLM Inference Sync',
    roomName: 'platform-architecture',
    time: '18:00 - 18:45',
    date: 'Today',
    duration: '45m',
    host: 'Alex (You)',
    participants: ['Alex', 'Zach'],
    agents: ['Hanzo Coder', 'Vi'],
    botInvited: true,
    url: 'https://meet.hanzo.ai/platform-architecture',
  },
  {
    id: 'meet-2',
    title: 'Research Review',
    roomName: 'research-review',
    time: '20:00 - 21:00',
    date: 'Today',
    duration: '60m',
    host: 'Research',
    participants: ['Alex', 'Research Team'],
    agents: ['Hanzo Researcher', 'Maya'],
    botInvited: true,
    url: 'https://meet.hanzo.ai/research-review',
  },
  {
    id: 'meet-3',
    title: 'Security & Compliance Sync',
    roomName: 'security-sync',
    time: '11:00 - 11:30',
    date: 'Tomorrow',
    duration: '30m',
    host: 'Security',
    participants: ['Alex', 'Core Developers'],
    agents: ['Des', 'Einstein'],
    botInvited: false,
    url: 'https://meet.hanzo.ai/security-sync',
  },
]

/**
 * The co-pilot's answer to one thing said in the call, in a sentence or two a
 * voice can read. Asked of the gateway as the reader (`token`, from
 * `useIamToken`) through the one API host; a refusal is thrown with what the
 * gateway said, never answered with a line nobody wrote.
 */
async function generateAgentMeetingResponse(prompt: string, agentName: string, token: string | null): Promise<string> {
  if (!token) throw new Error('Sign in to ask the co-pilot.')
  const res = await fetch(`${api()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: ENSO,
      messages: [
        {
          role: 'system',
          content: `You are ${agentName}, participating in a live Hanzo Meet video call. Respond succinctly, conversationally, and informatively in 1 to 2 sentences suitable for voice synthesis.`,
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 150,
    }),
  })
  if (!res.ok) throw new Error(`The co-pilot is unavailable (${res.status}).`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('The co-pilot answered with nothing.')
  return text
}

/** design's smallest rung (`--text-floor`, 10px), below gui's `$1`; gui's font size takes a rung or a number. */
const FLOOR = 10

export function Meet() {
  const [activeMeetingRoom, setActiveMeetingRoom] = useState<string | null>(null)
  const [roomInput, setRoomInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [botAssisting, setBotAssisting] = useState(true)
  // Below md the co-pilot is a sheet over the stage, opened from the bar.
  const [copilot, setCopilot] = useState(false)
  const [meetings] = useState<ScheduledMeeting[]>(DEFAULT_MEETINGS)

  // Agent Invitation and Active Call Participation
  const [invitedAgents, setInvitedAgents] = useState<string[]>(['Hanzo Coder', 'Hanzo Researcher'])
  const [activeCoPilotAgent, setActiveCoPilotAgent] = useState<string>('Hanzo Coder')
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [meetingView, setMeetingView] = useState<'iframe' | 'grid'>('iframe')
  const [agentQuestion, setAgentQuestion] = useState('')

  // Agent Speech in Call
  const { token } = useIamToken()
  const { speaking, speak, toggle } = useAgentSpeech(activeCoPilotAgent)
  const [audioTesting, setAudioTesting] = useState(false)

  // The call's notes: what was said and answered here, and nothing before it.
  const [liveNotes, setLiveNotes] = useState<string[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (activeMeetingRoom) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
      return
    }

    if (cameraOn && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          localStreamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch(() => {})
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [cameraOn, activeMeetingRoom])

  // Stop speech when meeting closes
  useEffect(() => {
    return () => {
      stopAgentSpeech()
    }
  }, [])

  const startInstantMeeting = () => {
    const randomId = `hanzo-${Math.random().toString(36).slice(2, 8)}`
    setActiveMeetingRoom(randomId)
  }

  const joinCustomMeeting = () => {
    if (!roomInput.trim()) return
    let clean = roomInput.trim()
    if (clean.includes('meet.hanzo.ai/')) {
      clean = clean.split('meet.hanzo.ai/')[1].split('?')[0].split('#')[0]
    }
    setActiveMeetingRoom(clean)
  }

  const handleCopyLink = (room: string) => {
    const link = `https://meet.hanzo.ai/${room}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleAgentInvite = (agentName: string) => {
    setInvitedAgents((prev) => {
      if (prev.includes(agentName)) {
        const next = prev.filter((a) => a !== agentName)
        return next.length > 0 ? next : [agentName]
      }
      return [...prev, agentName]
    })
  }

  const testAudioSpeaker = () => {
    if (audioTesting) {
      stopAgentSpeech()
      setAudioTesting(false)
      return
    }
    setAudioTesting(true)
    speakAgent(
      `Welcome to Hanzo Meet. This is ${activeCoPilotAgent}'s voice. If you can hear this, your speakers are working.`,
      {
        agent: activeCoPilotAgent,
        token,
        onEnd: () => setAudioTesting(false),
        onError: () => setAudioTesting(false),
      },
    )
  }

  // HANDS-FREE is one spoken conversation with the co-pilot, on @hanzo/voice:
  // the mic records, each pause goes to Hanzo's /v1/audio/transcriptions, the
  // utterance is answered, and the answer is read in the co-pilot's cast voice
  // by /v1/audio/speech. Speaking over the reply stops it (the machine's
  // barge-in). Every browser that can record takes part, not only the ones with
  // a working SpeechRecognition — Chromium on Linux and Firefox have none.
  const ear = useMemo(() => speech({ ...base(), ...(token ? { token } : {}) }), [token])
  const handsFree = useVoice({
    speech: ear,
    onUtterance: (transcript) => void handleSpokenInput(transcript),
  })
  const handsFreeSay = handsFree.say

  const handleSpokenInput = useCallback(
    async (transcript: string) => {
      const time = new Date().toLocaleTimeString().slice(0, 5)
      setLiveNotes((prev) => [...prev, `${time}: You (voice): ${transcript}`])
      try {
        const reply = await generateAgentMeetingResponse(transcript, activeCoPilotAgent, token)
        setLiveNotes((prev) => [...prev, `${time}: ${activeCoPilotAgent} (AI): ${reply}`])
        void handsFreeSay(cleanForSpeech(reply), voiceOf(activeCoPilotAgent))
      } catch (err) {
        setLiveNotes((prev) => [...prev, `${time}: ${activeCoPilotAgent} did not answer: ${(err as Error).message}`])
      }
    },
    [activeCoPilotAgent, token, handsFreeSay],
  )

  const handleAskAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = agentQuestion.trim()
    if (!q) return
    setAgentQuestion('')
    const time = new Date().toLocaleTimeString().slice(0, 5)
    setLiveNotes((prev) => [...prev, `${time}: You: ${q}`])
    try {
      const reply = await generateAgentMeetingResponse(q, activeCoPilotAgent, token)
      setLiveNotes((prev) => [...prev, `${time}: ${activeCoPilotAgent} (AI): ${reply}`])
      speak(reply, activeCoPilotAgent)
    } catch (err) {
      setLiveNotes((prev) => [...prev, `${time}: ${activeCoPilotAgent} did not answer: ${(err as Error).message}`])
    }
  }

  // The briefing is the call's own notes, read aloud; with none there is nothing to brief.
  const handleReadBriefing = () => {
    if (!liveNotes.length) return
    toggle(`Briefing for ${activeMeetingRoom || 'this call'}. ${liveNotes.join('. ')}`, activeCoPilotAgent)
  }

  // What the hands-free control says: why it cannot run, or that Hanzo's speech
  // refused and the browser stood in (or could not) — never silence.
  const handsFreeNote = handsFree.reason ?? (handsFree.refusal ? REFUSED[handsFree.refusal.covered ? 'covered' : 'lost'] : null)

  return (
    <YStack width="100%" height="100%" bg="$background" overflowX="auto" overflowY="auto">
      {/* Top Header: one row from a laptop; on a phone the controls wrap under the title rather than clip it. */}
      <XStack
        minH={56}
        px={20}
        py={8}
        gap={10}
        flexWrap="wrap"
        bg="$panel"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        items="center"
        justify="space-between"
      >
        {/* Every part of this bar gives way on a phone, as a block box would: shrinking, never below its content. */}
        <XStack items="center" gap={12} shrink={1} minW="auto">
          <XStack width={32} height={32} rounded={8} bg="$raised" items="center" justify="center" shrink={1} minW="auto">
            <Video size={18} color="var(--foreground)" />
          </XStack>
          <YStack shrink={1} minW="auto">
            <XStack items="center" gap={8}>
              <Text fontSize="$4" fontWeight="700" color="$ink">Hanzo Meet</Text>
              <Text
                fontSize={FLOOR}
                fontWeight="700"
                bg="$hover"
                color="$soft"
                borderWidth={1}
                borderColor="$borderColor"
                px={6}
                py={1}
                rounded={4}
              >
                LIVE · meet.hanzo.ai
              </Text>
            </XStack>
            <Text fontSize="$1" color="$soft">
              Native WebRTC video conferencing with AI meeting bot transcription &amp; voice
            </Text>
          </YStack>
        </XStack>

        {activeMeetingRoom ? (
          <XStack items="center" gap={8} shrink={1} minW="auto" flexWrap="wrap">
            <XStack bg="$hover" rounded={8} p={2} gap={2} borderWidth={1} borderColor="$borderColor" shrink={1} minW="auto">
              {([
                ['iframe', 'SFU Stage', Tv],
                ['grid', 'Agent Grid', LayoutGrid],
              ] as const).map(([view, label, Icon]) => (
                <Button
                  key={view}
                  size="sm"
                  variant={meetingView === view ? 'primary' : 'ghost'}
                  {...(meetingView === view ? null : { color: '$soft' })}
                  aria-pressed={meetingView === view}
                  onClick={() => setMeetingView(view)}
                >
                  <Icon size={12} />
                  {label}
                </Button>
              ))}
            </XStack>

            {/* On a phone the co-pilot folds into a sheet over the stage, and this opens it. */}
            {botAssisting ? (
              <View display="none" $max-md={{ display: 'flex' }}>
                <Button
                  size="sm"
                  variant={copilot ? 'secondary' : 'default'}
                  onClick={() => setCopilot((v) => !v)}
                  aria-label="Co-pilot"
                  aria-expanded={copilot}
                  aria-controls="meet-copilot"
                >
                  <Bot size={13} />
                  Co-pilot
                </Button>
              </View>
            ) : null}
            <Button size="sm" onClick={() => handleCopyLink(activeMeetingRoom)}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Link Copied' : 'Copy Room Link'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                stopAgentSpeech()
                // Leaving the call hangs up the hands-free conversation with it.
                if (handsFree.open) handsFree.toggle()
                setActiveMeetingRoom(null)
              }}
            >
              <PhoneOff size={14} />
              Leave Call
            </Button>
          </XStack>
        ) : (
          <XStack items="center" gap={8} shrink={1} minW="auto">
            <Button asChild variant="linkMuted" size="sm" px={0}>
              <a href="https://meet.hanzo.ai" target="_blank" rel="noopener noreferrer">
                meet.hanzo.ai
                <ExternalLink size={12} />
              </a>
            </Button>
          </XStack>
        )}
      </XStack>

      {/* Main Content */}
      {activeMeetingRoom ? (
        /* Active Video Call Screen */
        <XStack flex={1} overflow="hidden" position="relative">
          {/* The stage gives way only down to what it holds, as a block box would: the grid keeps its 280px tiles. */}
          <XStack flex={1} minW="auto" position="relative" bg="$sunken">
            {/* Keyed apart: one gui View in one place that changes `render` changes the hooks it runs. */}
            {meetingView === 'iframe' ? (
              <View
                key="stage"
                render={
                  <iframe
                    src={`https://meet.hanzo.ai/${activeMeetingRoom}#config.prejoinPageEnabled=false&config.startWithAudioMuted=${!micOn}&config.startWithVideoMuted=${!cameraOn}`}
                    allow="camera; microphone; display-capture; autoplay; clipboard-write; speaker-selection; screen-wake-lock"
                    title={`Hanzo Meet Room: ${activeMeetingRoom}`}
                  />
                }
                width="100%"
                height="100%"
                borderWidth={0}
                bg="$sunken"
              />
            ) : (
              /* Agent Grid View */
              <View
                key="grid"
                flex={1}
                display="grid"
                gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))"
                gap={12}
                p={16}
                overflowY="auto"
                bg="$background"
              >
                {/* User Camera Tile */}
                <YStack
                  bg="$panel"
                  rounded={12}
                  borderWidth={1}
                  borderColor="$borderColor"
                  position="relative"
                  overflow="hidden"
                  items="center"
                  justify="center"
                  minH={220}
                >
                  <YStack items="center">
                    <YStack
                      width={72}
                      height={72}
                      rounded={9999}
                      bg="$raised"
                      items="center"
                      justify="center"
                      mb={8}
                    >
                      <Text fontSize="$8" fontWeight="700" color="$ink">
                        You
                      </Text>
                    </YStack>
                    <Text fontSize="$2" fontWeight="600" color="$ink">
                      Alex (Host)
                    </Text>
                    <Text fontSize="$1" color={micOn ? GOOD : '$soft'}>
                      {micOn ? 'Mic Active' : 'Muted'}
                    </Text>
                  </YStack>
                </YStack>

                {/* AI Agents Tiles */}
                {invitedAgents.map((agentName) => {
                  const voice = voiceOf(agentName)
                  const isThisSpeaking =
                    (speaking || handsFree.state === 'speaking') && activeCoPilotAgent.toLowerCase() === agentName.toLowerCase()

                  return (
                    <YStack
                      key={agentName}
                      bg="$panel"
                      rounded={12}
                      borderWidth={isThisSpeaking ? 2 : 1}
                      borderColor={isThisSpeaking ? 'var(--state-success)' : '$borderColor'}
                      position="relative"
                      overflow="hidden"
                      items="center"
                      justify="center"
                      p={20}
                      minH={220}
                      transition="200ms"
                    >
                      <View position="relative" mb={10}>
                        <Face name={agentName} size={72} />
                        {isThisSpeaking ? (
                          <View
                            position="absolute"
                            b={-4}
                            r={-4}
                            bg="var(--popover)"
                            borderWidth={1}
                            borderColor="var(--state-success)"
                            rounded={9999}
                            p={4}
                          >
                            <Volume2 size={12} color={GOOD} />
                          </View>
                        ) : null}
                      </View>

                      <Text fontSize="$3" fontWeight="700" color="$ink" mb={2}>
                        {agentName}
                      </Text>
                      <Text fontSize="$1" color="$soft" mb={8}>
                        Voice: {voice}
                      </Text>

                      <XStack
                        items="center"
                        gap={6}
                        bg="$hover"
                        px={10}
                        py={4}
                        rounded={12}
                      >
                        {isThisSpeaking ? (
                          <>
                            <AudioWave active={true} color="var(--state-success)" />
                            <Text fontSize="$1" fontWeight="600" color={GOOD}>
                              Speaking in Call
                            </Text>
                          </>
                        ) : (
                          <>
                            <Bot size={11} color="var(--muted-foreground)" />
                            <Text fontSize="$1" fontWeight="600" color="$quiet">
                              AI Agent · In Call
                            </Text>
                          </>
                        )}
                      </XStack>
                    </YStack>
                  )
                })}
              </View>
            )}
          </XStack>

          {/* AI Bot Meeting Co-pilot Sidebar */}
          {botAssisting ? (
            <YStack
              id="meet-copilot"
              width={360}
              minW={360}
              bg="$panel"
              borderLeftWidth={1}
              borderLeftColor="$borderColor"
              p={16}
              gap={12}
              $max-md={{
                display: copilot ? 'flex' : 'none',
                position: 'absolute',
                t: 0,
                r: 0,
                b: 0,
                l: 0,
                width: 'auto',
                minW: 0,
                z: 'var(--z-sheet)',
                borderLeftWidth: 0,
              }}
            >
              {/* Co-pilot Header & Agent Picker */}
              <XStack items="center" justify="space-between">
                <XStack items="center" gap={8}>
                  <Face name={activeCoPilotAgent} size={28} />
                  <YStack>
                    <Text fontSize="$2" fontWeight="700" color="$ink">
                      {activeCoPilotAgent}
                    </Text>
                    <Text fontSize={FLOOR} color="$faint">
                      AI Co-pilot · Voice: {voiceOf(activeCoPilotAgent)}
                    </Text>
                  </YStack>
                </XStack>
                <Text
                  fontSize={FLOOR}
                  fontWeight="700"
                  color={GOOD}
                  bg="$hover"
                  px={6}
                  py={2}
                  rounded={4}
                >
                  Live in call
                </Text>
              </XStack>

              {/* Agent switcher chips */}
              <XStack gap={4} flexWrap="wrap">
                {invitedAgents.map((agent) => (
                  <Button
                    key={agent}
                    size="sm"
                    variant={activeCoPilotAgent === agent ? 'secondary' : 'ghost'}
                    color={activeCoPilotAgent === agent ? '$ink' : '$soft'}
                    aria-pressed={activeCoPilotAgent === agent}
                    onClick={() => setActiveCoPilotAgent(agent)}
                  >
                    {agent}
                  </Button>
                ))}
              </XStack>

              {/* Voice Actions: Briefing & Hands-Free Mode */}
              <XStack gap={8}>
                <Button
                  size="sm"
                  flex={1}
                  variant={speaking ? 'secondary' : 'default'}
                  disabled={!speaking && !liveNotes.length}
                  onClick={handleReadBriefing}
                >
                  {speaking ? (
                    <>
                      <AudioWave active={true} color="var(--state-success)" />
                      Stop Briefing
                      <Square size={11} fill="currentColor" />
                    </>
                  ) : (
                    <>
                      <Volume2 size={14} />
                      Briefing
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant={handsFree.open ? 'secondary' : 'default'}
                  data-testid="hands-free-voice-toggle"
                  data-state={handsFree.state}
                  data-refusal={handsFree.refusal ? handsFree.refusal.service : undefined}
                  aria-pressed={handsFree.open}
                  disabled={!!handsFree.blocked}
                  title={
                    handsFreeNote ??
                    (handsFree.open ? 'Hands-Free Voice Active (Speaks and interrupts on voice)' : 'Enable Hands-Free Voice Mode')
                  }
                  onClick={handsFree.toggle}
                >
                  <Mic size={14} color={handsFree.open ? 'var(--state-success)' : 'currentColor'} />
                  {handsFree.open ? 'Hands-Free On' : 'Hands-Free'}
                </Button>
              </XStack>
              {handsFreeNote ? (
                <Text fontSize="$1" color="$soft" role="status">
                  {handsFreeNote}
                </Text>
              ) : null}

              {/* Real-time Notes Stream */}
              <YStack
                flex={1}
                overflowY="auto"
                bg="$background"
                rounded={8}
                borderWidth={1}
                borderColor="$borderColor"
                p={12}
                gap={8}
              >
                {liveNotes.map((note, i) => (
                  <Text
                    key={i}
                    fontSize="$1"
                    color="$quiet"
                    lineHeight={16.5}
                    pb={8}
                    borderBottomWidth={1}
                    borderBottomColor="$borderColor"
                  >
                    {note}
                  </Text>
                ))}
              </YStack>

              {/* Ask Agent Question during Call */}
              <XStack render="form" {...{ onSubmit: handleAskAgent }} gap={6}>
                <Text
                  render={
                    <input
                      type="text"
                      value={agentQuestion}
                      onChange={(e) => setAgentQuestion(e.target.value)}
                      placeholder={`Ask ${activeCoPilotAgent} in meeting...`}
                    />
                  }
                  flex={1}
                  bg="$background"
                  borderWidth={1}
                  borderColor="var(--border-control)"
                  rounded={6}
                  px={10}
                  py={8}
                  color="$ink"
                  fontSize="$1"
                  outlineStyle="none"
                />
                <Button type="submit" variant="primary" size="icon-sm" disabled={!agentQuestion.trim()} aria-label="Ask">
                  <Send size={12} />
                </Button>
              </XStack>

              {/* Quick Actions */}
              <XStack gap={8}>
                <Button
                  size="sm"
                  flex={1}
                  disabled={!agentQuestion.trim()}
                  title="Add what is typed above to the notes, without asking the co-pilot"
                  onClick={() => {
                    const note = agentQuestion.trim()
                    if (!note) return
                    setAgentQuestion('')
                    setLiveNotes((prev) => [...prev, `${new Date().toLocaleTimeString().slice(0, 5)}: You (note): ${note}`])
                  }}
                >
                  + Add Live Note
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const text = liveNotes.join('\n')
                    navigator.clipboard.writeText(text)
                  }}
                >
                  Copy Summary
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </XStack>
      ) : (
        /* Meeting Lobby & Schedule Hub. Two columns from a laptop; below one the
           pane beside the sidebar is too narrow for two, so the columns stack,
           each as tall as what it holds, and the lobby scrolls as one page. */
        <XStack
          flex={1}
          overflow="hidden"
          $max-lg={{ flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}
        >
          {/* Left Hero: Instant Join & Pre-flight Camera Check */}
          <YStack
            flex={1}
            minW={0}
            p={32}
            gap={24}
            overflowY="auto"
            $max-lg={{ p: 16, flexBasis: 'auto', shrink: 0, overflowY: 'visible', overflowX: 'hidden' }}
          >
            <YStack gap={6}>
              <Text fontSize="$8" fontWeight="800" color="$ink" letterSpacing={-0.5}>
                Secure, High-Definition Video Calls
              </Text>
              <Text fontSize="$3" color="$soft">
                Powered by native Hanzo Meet (<Text render={<a href="https://meet.hanzo.ai" target="_blank" rel="noopener noreferrer" />} color="$ink" textDecorationLine="underline">meet.hanzo.ai</Text>). Connect with team members, clients, and autonomous AI agents.
              </Text>
            </YStack>

            {/* Quick Actions Row */}
            <XStack gap={12} flexWrap="wrap">
              <Button variant="primary" size="lg" onClick={startInstantMeeting}>
                <Plus size={16} />
                Start Instant Meeting
              </Button>

              <XStack
                items="center"
                gap={6}
                bg="$panel"
                borderWidth={1}
                borderColor="var(--border-control)"
                rounded={8}
                px={4}
                height={42}
              >
                <Text
                  render={
                    <input
                      type="text"
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && joinCustomMeeting()}
                      placeholder="Enter meeting code or link"
                      aria-label="Meeting code or link"
                    />
                  }
                  bg="transparent"
                  borderWidth={0}
                  outlineStyle="none"
                  color="$ink"
                  fontSize="$2"
                  width={220}
                  px={8}
                />
                <Button variant="primary" size="sm" disabled={!roomInput.trim()} onClick={joinCustomMeeting}>
                  Join
                </Button>
              </XStack>

              <Button
                size="lg"
                variant={showAgentPicker ? 'secondary' : 'default'}
                aria-expanded={showAgentPicker}
                onClick={() => setShowAgentPicker(!showAgentPicker)}
              >
                <UserPlus size={14} />
                {`Invite Agents (${invitedAgents.length})`}
              </Button>
            </XStack>

            {/* Agent Picker Panel */}
            {showAgentPicker ? (
              <YStack
                bg="$panel"
                borderWidth={1}
                borderColor="var(--border-control)"
                rounded={12}
                p={16}
                maxW={560}
              >
                <XStack items="center" justify="space-between" mb={12}>
                  <Text fontSize="$2" fontWeight="700" color="$ink">
                    Select AI Agents to Attend Meetings
                  </Text>
                  <Text fontSize="$1" color="$soft">
                    Each agent joins the call with voice synthesis &amp; pair programming
                  </Text>
                </XStack>

                <View display="grid" gridTemplateColumns="repeat(auto-fill, minmax(220px, 1fr))" gap={8}>
                  {AVAILABLE_MEETING_AGENTS.map((agent) => {
                    const isInvited = invitedAgents.includes(agent.name)
                    return (
                      <XStack
                        key={agent.id}
                        onClick={() => toggleAgentInvite(agent.name)}
                        items="center"
                        gap={10}
                        px={10}
                        py={8}
                        rounded={8}
                        bg={isInvited ? '$raised' : '$hover'}
                        borderWidth={1}
                        borderColor={isInvited ? 'var(--border-selected)' : '$borderColor'}
                        cursor="pointer"
                        transition="quickest"
                      >
                        <Face name={agent.name} size={32} />
                        <YStack flex={1} minW={0}>
                          <Text fontSize="$2" fontWeight="600" color="$ink">
                            {agent.name}
                          </Text>
                          <Text fontSize={10} color="$faint" numberOfLines={1}>
                            {agent.role} · Voice: {agent.voice}
                          </Text>
                        </YStack>
                        <View
                          width={16}
                          height={16}
                          rounded={4}
                          borderWidth={isInvited ? 0 : 1}
                          borderColor="var(--border-selected)"
                          bg={isInvited ? 'var(--foreground)' : 'transparent'}
                          items="center"
                          justify="center"
                        >
                          {isInvited ? <Check size={11} strokeWidth={3} color="var(--background)" /> : null}
                        </View>
                      </XStack>
                    )
                  })}
                </View>
              </YStack>
            ) : null}

            {/* Camera & Hardware Pre-flight Test Box */}
            <YStack
              bg="$panel"
              borderWidth={1}
              borderColor="$borderColor"
              rounded={12}
              overflow="hidden"
              maxW={560}
            >
              <XStack height={280} bg="$sunken" position="relative" items="center" justify="center">
                {cameraOn ? (
                  <View
                    render={<video ref={videoRef} autoPlay playsInline muted />}
                    width="100%"
                    height="100%"
                    objectFit="cover"
                  />
                ) : (
                  <YStack items="center" gap={8}>
                    <XStack width={64} height={64} rounded={9999} bg="$raised" items="center" justify="center">
                      <VideoOff size={28} color="var(--muted-foreground)" />
                    </XStack>
                    <Text fontSize="$2" color="$soft">Camera is off</Text>
                  </YStack>
                )}

                {/* Overlay Controls */}
                {/* A Button's label never wraps, so the bar does: on a narrow stage the toggles take a second row. */}
                <XStack
                  position="absolute"
                  b={16}
                  maxW="calc(100% - 24px)"
                  items="center"
                  justify="center"
                  flexWrap="wrap"
                  gap={8}
                  bg="var(--surface-overlay)"
                  backdropFilter="blur(8px)"
                  px={12}
                  py={6}
                  rounded={24}
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <Button
                    size="icon"
                    rounded={9999}
                    variant={cameraOn ? 'default' : 'destructive'}
                    aria-label={cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
                    title={cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
                    onClick={() => setCameraOn(!cameraOn)}
                  >
                    {cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
                  </Button>

                  <Button
                    size="icon"
                    rounded={9999}
                    variant={micOn ? 'default' : 'destructive'}
                    aria-label={micOn ? 'Mute Mic' : 'Unmute Mic'}
                    title={micOn ? 'Mute Mic' : 'Unmute Mic'}
                    onClick={() => setMicOn(!micOn)}
                  >
                    {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                  </Button>

                  {/* Speaker & Audio Test Button */}
                  <Button
                    size="sm"
                    rounded={9999}
                    variant={audioTesting ? 'secondary' : 'default'}
                    title="Test Agent Voice & Audio Output"
                    onClick={testAudioSpeaker}
                  >
                    {audioTesting ? (
                      <>
                        <AudioWave active={true} color="var(--state-success)" />
                        Testing Audio…
                      </>
                    ) : (
                      <>
                        <Volume2 size={13} />
                        Test Audio
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    rounded={9999}
                    variant={botAssisting ? 'secondary' : 'default'}
                    aria-pressed={botAssisting}
                    onClick={() => setBotAssisting(!botAssisting)}
                  >
                    <Bot size={13} />
                    {botAssisting ? 'AI Bot Co-pilot ON' : 'AI Bot OFF'}
                  </Button>
                </XStack>
              </XStack>

              <XStack p={12} items="center" justify="space-between" bg="$panel">
                <Text fontSize="$1" color="$soft">
                  Readiness: Camera {cameraOn ? 'Active' : 'Muted'} · Mic {micOn ? 'Active' : 'Muted'} · Audio {audioTesting ? 'Testing' : 'Ready'}
                </Text>
                <Text fontSize="$1" color="$quiet" fontWeight="600">
                  HD 1080p Ready
                </Text>
              </XStack>
            </YStack>
          </YStack>

          {/* Right Column: Scheduled Meetings & Cal Sync */}
          <YStack
            grow={1}
            shrink={1}
            flexBasis={380}
            minW={0}
            maxW="100%"
            bg="$panel"
            borderLeftWidth={1}
            borderLeftColor="$borderColor"
            p={16}
            gap={14}
            overflowY="auto"
            $max-lg={{
              shrink: 0,
              flexBasis: 'auto',
              borderLeftWidth: 0,
              borderTopWidth: 1,
              borderTopColor: '$borderColor',
              overflowX: 'hidden',
            }}
          >
            <XStack items="center" justify="space-between">
              <Text fontSize="$3" fontWeight="700" color="$ink">
                Upcoming Meetings
              </Text>
              <Text fontSize="$1" color="$faint">
                Synced with /cal
              </Text>
            </XStack>

            <YStack gap={10}>
              {meetings.map((m) => (
                <YStack
                  key={m.id}
                  bg="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded={8}
                  p={12}
                  gap={8}
                >
                  <XStack items="center" justify="space-between">
                    <Text
                      fontSize={FLOOR}
                      fontWeight="700"
                      bg="$raised"
                      color="$ink"
                      px={6}
                      py={2}
                      rounded={4}
                    >
                      {m.date} · {m.time}
                    </Text>
                    {m.botInvited ? (
                      <XStack items="center" gap={4}>
                        <Bot size={12} color="var(--muted-foreground)" />
                        <Text fontSize={FLOOR} color="$soft" fontWeight="600">Agents Attending</Text>
                      </XStack>
                    ) : null}
                  </XStack>

                  <Text fontSize="$2" fontWeight="600" color="$ink" lineHeight={16.9}>
                    {m.title}
                  </Text>

                  {/* Attendees & Agents row */}
                  <XStack items="center" gap={6} flexWrap="wrap">
                    <Text fontSize="$1" color="$soft">
                      Host: {m.host}
                    </Text>
                    {m.agents && m.agents.length > 0 ? (
                      <XStack display="inline-flex" items="center" gap={4}>
                        <Text fontSize="$1" color="$faint">·</Text>
                        <Text fontSize="$1" color="$soft">
                          {m.agents.join(', ')}
                        </Text>
                      </XStack>
                    ) : null}
                  </XStack>

                  <XStack gap={8} mt={4}>
                    <Button
                      variant="primary"
                      size="sm"
                      flex={1}
                      onClick={() => {
                        if (m.agents) {
                          setInvitedAgents(m.agents)
                          if (m.agents[0]) setActiveCoPilotAgent(m.agents[0])
                        }
                        setActiveMeetingRoom(m.roomName)
                      }}
                    >
                      <Video size={12} />
                      Join Call
                    </Button>
                    <Button
                      size="icon-sm"
                      aria-label="Copy invite link"
                      title="Copy invite link"
                      onClick={() => handleCopyLink(m.roomName)}
                    >
                      <Copy size={12} />
                    </Button>
                  </XStack>
                </YStack>
              ))}
            </YStack>

            {/* Schedule Meeting Callout linking to /cal */}
            <YStack
              mt="auto"
              p={12}
              bg="$background"
              rounded={8}
              borderWidth={1}
              borderColor="$borderColor"
              gap={6}
            >
              <XStack items="center" gap={8}>
                <Calendar size={14} color="var(--muted-foreground)" />
                <Text fontSize="$2" fontWeight="700" color="$ink">Need to book a slot?</Text>
              </XStack>
              <Text fontSize="$1" color="$soft">
                Use the Hanzo Calendar Scheduler to coordinate available times across team members and bots.
              </Text>
              <Button asChild variant="link" size="sm" px={0} justify="flex-start">
                <a href="/cal">
                  Open Calendar Scheduler
                  <ArrowRight size={11} />
                </a>
              </Button>
            </YStack>
          </YStack>
        </XStack>
      )}
    </YStack>
  )
}
