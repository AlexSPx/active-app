import { useEffect, useRef, useState } from 'react'
import { TextField } from './Controls'

type StrengthField = 'weight' | 'reps'

type StrengthTargetInputProps = {
  index: number
  field: StrengthField
  value: number | null | undefined
  onChange: (value: number | null) => void
} & ({ mode: 'editor'; completed?: never } | { mode: 'session'; completed: boolean })

function strengthLabel(field: StrengthField, index: number) {
  return `Set ${index + 1} ${field === 'weight' ? 'weight in kilograms' : 'reps'}`
}

function strengthInputValue(value: number | null | undefined) {
  return value == null ? '' : String(value)
}

export function StrengthTargetInput({
  index,
  field,
  value,
  mode,
  completed = false,
  onChange,
}: StrengthTargetInputProps) {
  const [text, setText] = useState(() => strengthInputValue(value))
  const [isFocused, setIsFocused] = useState(false)
  const lastReportedValue = useRef<number | null>(value ?? null)

  useEffect(() => {
    const currentValue = value ?? null
    if (currentValue !== lastReportedValue.current) {
      setText(strengthInputValue(value))
      lastReportedValue.current = currentValue
    }
  }, [value])

  return (
    <TextField
      className={`h-touch min-h-touch flex-1 px-compact text-center ${completed ? 'border-accent bg-accent text-on-accent' : 'border-divider bg-raised text-foreground'}`}
      accessibilityLabel={strengthLabel(field, index)}
      keyboardType={field === 'weight' ? 'decimal-pad' : 'number-pad'}
      placeholder={isFocused ? '' : field === 'weight' ? 'kg' : 'reps'}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      value={text}
      onChangeText={(next) => {
        setText(next)
        const normalized = next.trim().replace(',', '.')
        const parsed =
          normalized &&
          (mode === 'session' && field === 'reps'
            ? Number.isFinite(Number.parseInt(normalized, 10))
            : Number.isFinite(Number(normalized)))
            ? mode === 'session' && field === 'reps'
              ? Number.parseInt(normalized, 10)
              : Number(normalized)
            : null
        lastReportedValue.current = parsed
        onChange(parsed)
      }}
    />
  )
}

type DurationTargetInputProps = {
  index: number
  completed?: boolean
} & (
  | {
      mode: 'editor'
      seconds: number | null | undefined
      onChange: (seconds: number | null) => void
    }
  | { mode: 'session'; seconds: number; onChange: (seconds: number) => void }
)

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function parseDuration(text: string) {
  const match = /^(\d+):([0-5]\d)$/.exec(text.trim())
  if (!match) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return Number.isSafeInteger(seconds) ? seconds : null
}

function digitsToSeconds(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  const padded = digits.padStart(3, '0')
  const minutes = Number(padded.slice(0, -2)) || 0
  return minutes * 60 + Number(padded.slice(-2))
}

function formatDigits(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return '0:00'
  const padded = digits.padStart(3, '0')
  const minutes = Number(padded.slice(0, -2)) || 0
  return `${minutes}:${padded.slice(-2)}`
}

function secondsToDigits(seconds: number) {
  if (seconds <= 0) return ''
  return `${Math.floor(seconds / 60)}${String(seconds % 60).padStart(2, '0')}`
}

export function DurationTargetInput(props: DurationTargetInputProps) {
  const { index, mode } = props
  const [editorText, setEditorText] = useState(() =>
    mode === 'editor' ? formatDuration(props.seconds) : ''
  )
  const [sessionDigits, setSessionDigits] = useState(() =>
    mode === 'session' ? secondsToDigits(props.seconds) : ''
  )
  const lastReportedSeconds = useRef<number | null>(props.seconds ?? null)
  const seconds = props.seconds

  useEffect(() => {
    const currentSeconds = seconds ?? null
    if (currentSeconds !== lastReportedSeconds.current) {
      if (mode === 'editor') setEditorText(formatDuration(seconds))
      else setSessionDigits(secondsToDigits(seconds))
      lastReportedSeconds.current = currentSeconds
    }
  }, [mode, seconds])

  const completed = props.mode === 'session' && props.completed
  return (
    <TextField
      className={`h-touch min-h-touch flex-1 px-compact text-center ${completed ? 'border-accent bg-accent text-on-accent' : 'border-divider bg-raised text-foreground'}`}
      accessibilityLabel={`Interval ${index + 1} duration in minutes and seconds`}
      keyboardType={mode === 'editor' ? 'default' : 'number-pad'}
      placeholder="0:00"
      value={mode === 'editor' ? editorText : formatDigits(sessionDigits)}
      onChangeText={(next) => {
        if (mode === 'editor') {
          setEditorText(next)
          const parsed = parseDuration(next)
          lastReportedSeconds.current = parsed
          props.onChange(parsed)
          return
        }
        const nextDigits = next.replace(/\D/g, '')
        setSessionDigits(nextDigits)
        const nextSeconds = digitsToSeconds(nextDigits)
        lastReportedSeconds.current = nextSeconds
        props.onChange(nextSeconds)
      }}
      onKeyPress={
        mode === 'session'
          ? (event) => {
              if (event.nativeEvent.key === 'Backspace') {
                setSessionDigits((digits) => digits.slice(0, -1))
              }
            }
          : undefined
      }
      onBlur={
        mode === 'session'
          ? () => {
              const nextSeconds = digitsToSeconds(sessionDigits)
              if (lastReportedSeconds.current !== nextSeconds) {
                lastReportedSeconds.current = nextSeconds
                props.onChange(nextSeconds)
              }
            }
          : undefined
      }
    />
  )
}
