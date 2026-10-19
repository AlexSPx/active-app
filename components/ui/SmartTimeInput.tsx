import { useEffect, useState } from 'react'
import { TextInput, type TextInputProps } from 'react-native'

type Props = {
  seconds?: number
  onChangeSeconds?: (secs: number) => void
  placeholder?: string
  className?: string
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onKeyPress' | 'onBlur' | 'placeholder'>

// Helper: format raw digits into mm:ss live (e.g. "7" -> 0:07, "70" -> 0:70, "700" -> 7:00)
const formatTimeFromDigits = (raw: string) => {
  if (!raw) return '0:00'
  const digits = raw.replace(/\D/g, '')
  const padded = digits.padStart(3, '0')
  const secondsPart = padded.slice(-2)
  const minutesPart = padded.slice(0, -2)
  const mins = parseInt(minutesPart, 10) || 0
  const secs = parseInt(secondsPart, 10) || 0
  return `${mins}:${String(secs).padStart(2, '0')}`
}

// Convert digits -> total seconds
const digitsToSeconds = (raw: string) => {
  if (!raw) return 0
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  const padded = digits.padStart(3, '0')
  const secondsPart = padded.slice(-2)
  const minutesPart = padded.slice(0, -2)
  const mins = parseInt(minutesPart, 10) || 0
  const secs = parseInt(secondsPart, 10) || 0
  return mins * 60 + secs
}

// Convert seconds -> edit digits (m + zero-padded ss)
const secondsToDigits = (total: number) => {
  if (!total || total <= 0) return ''
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}${String(s).padStart(2, '0')}`
}

export default function SmartTimeInput({
  seconds = 0,
  onChangeSeconds,
  placeholder = '0:00',
  keyboardType = 'numeric',
  className = '',
  ...rest
}: Props) {
  const [digits, setDigits] = useState<string>(secondsToDigits(seconds))
  const [display, setDisplay] = useState<string>(formatTimeFromDigits(digits))

  // keep local state in sync if parent seconds prop changes
  useEffect(() => {
    setDigits(secondsToDigits(seconds))
    setDisplay(() => {
      const d = secondsToDigits(seconds)
      return formatTimeFromDigits(d)
    })
  }, [seconds])

  const handleChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '')
    setDigits(cleaned)
    setDisplay(formatTimeFromDigits(cleaned))
  }

  const handleKeyPress = (e: any) => {
    try {
      if (e?.nativeEvent?.key === 'Backspace') {
        setDigits((prev) => {
          const newDigits = prev.slice(0, -1)
          setDisplay(formatTimeFromDigits(newDigits))
          return newDigits
        })
      }
    } catch {
      // ignore
    }
  }

  const handleBlur = () => {
    const secs = digitsToSeconds(digits)
    setDisplay(formatTimeFromDigits(digits))
    if (onChangeSeconds) onChangeSeconds(secs)
  }

  return (
    <TextInput
      {...rest}
      className={`w-full h-action rounded-control border border-divider bg-raised px-field text-body font-dm-regular text-foreground focus:border-accent ${className}`}
      keyboardType={keyboardType}
      value={display}
      onChangeText={handleChange}
      onKeyPress={handleKeyPress}
      onBlur={handleBlur}
      placeholder={placeholder}
      placeholderTextColorClassName="accent-muted"
      cursorColorClassName="accent-accent"
    />
  )
}
