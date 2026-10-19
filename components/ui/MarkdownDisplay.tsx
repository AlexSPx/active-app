import React from 'react'
import { View } from 'react-native'
import * as Linking from 'expo-linking'
import { UiText } from './Controls'

interface MarkdownDisplayProps {
  content: string
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'listItem'; marker: string; content: string }
  | { type: 'separator' }

/**
 * Render the small Markdown subset used by the bundled legal documents.
 * Blank lines delimit blocks; ordinary source line breaks are joined as
 * Markdown soft breaks, while the two trailing spaces used by the contact
 * details remain explicit line breaks.
 */
export function MarkdownDisplay({ content }: MarkdownDisplayProps) {
  if (!content) return null

  const blocks = parseBlocks(content)

  return (
    <View className="gap-section">
      {blocks.map((block, index) => {
        if (block.type === 'separator') {
          return <View key={index} className="my-field h-px bg-divider" />
        }

        if (block.type === 'heading') {
          const textRole =
            block.level === 1 ? 'screenTitle' : block.level === 2 ? 'cardTitle' : 'bodyEmphasis'

          return (
            <UiText
              key={index}
              accessibilityRole="header"
              textRole={textRole}
              className={block.level === 1 ? '' : 'mt-field'}
            >
              {parseInline(block.content)}
            </UiText>
          )
        }

        if (block.type === 'listItem') {
          return (
            <View key={index} className="ml-compact flex-row items-start gap-compact">
              <UiText textRole="body">{block.marker}</UiText>
              <UiText textRole="body" className="flex-1">
                {parseInline(block.content)}
              </UiText>
            </View>
          )
        }

        return (
          <UiText key={index} textRole="body">
            {parseInline(block.content)}
          </UiText>
        )
      })}
    </View>
  )
}

function parseBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const paragraphLines: Array<{ text: string; hardBreak: boolean }> = []

  const flushParagraph = () => {
    if (!paragraphLines.length) return

    const text = paragraphLines
      .map((line, index) => {
        if (index === 0) return line.text
        return `${paragraphLines[index - 1].hardBreak ? '\n' : ' '}${line.text}`
      })
      .join('')
      .trim()

    if (text) blocks.push({ type: 'paragraph', content: text })
    paragraphLines.length = 0
  }

  for (const sourceLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const line = sourceLine.trim()
    if (!line) {
      flushParagraph()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        content: heading[2],
      })
      continue
    }

    if (/^(?:---+|\*\*\*+|___+)$/.test(line)) {
      flushParagraph()
      blocks.push({ type: 'separator' })
      continue
    }

    const listItem = line.match(/^([-*+]|\d+\.)\s+(.+)$/)
    if (listItem) {
      flushParagraph()
      blocks.push({
        type: 'listItem',
        marker: /^\d/.test(listItem[1]) ? listItem[1] : '•',
        content: listItem[2],
      })
      continue
    }

    // Markdown treats an ordinary newline as a space and two trailing spaces
    // as a hard line break. Keep that distinction for the publisher details.
    const hardBreak = / {2,}$/.test(sourceLine)
    paragraphLines.push({ text: line, hardBreak })
  }

  flushParagraph()
  return blocks
}

function parseInline(text: string): React.ReactNode {
  const tokenPattern = /(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g
  const parts = text.split(tokenPattern)

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null

        const linkMatch = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/)
        if (linkMatch) {
          const [, label, url] = linkMatch
          return (
            <UiText
              key={index}
              textRole="body"
              className="text-accent underline"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(url)}
            >
              {parseInline(label)}
            </UiText>
          )
        }

        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <UiText key={index} textRole="bodyEmphasis">
              {parseInline(part.slice(2, -2))}
            </UiText>
          )
        }

        if (part.startsWith('__') && part.endsWith('__')) {
          return (
            <UiText key={index} textRole="bodyEmphasis">
              {parseInline(part.slice(2, -2))}
            </UiText>
          )
        }

        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <UiText key={index} textRole="bodyEmphasis" className="bg-raised">
              {part.slice(1, -1)}
            </UiText>
          )
        }

        if (
          (part.startsWith('*') && part.endsWith('*')) ||
          (part.startsWith('_') && part.endsWith('_'))
        ) {
          return (
            <UiText key={index} textRole="body" className="italic">
              {parseInline(part.slice(1, -1))}
            </UiText>
          )
        }

        return part
      })}
    </>
  )
}
