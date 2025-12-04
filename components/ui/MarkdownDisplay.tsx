import React from 'react'
import { YStack, Text, H1, H2, H3, Paragraph, XStack } from 'tamagui'

interface MarkdownDisplayProps {
  content: string
}

export function MarkdownDisplay({ content }: MarkdownDisplayProps) {
  if (!content) return null

  const lines = content.split('\n')

  return (
    <YStack gap="$3">
      {lines.map((line, index) => {
        const trimmedLine = line.trim()
        if (!trimmedLine) return null

        // Headers
        if (trimmedLine.startsWith('# ')) {
          return <H1 key={index}>{parseInline(trimmedLine.substring(2))}</H1>
        }
        if (trimmedLine.startsWith('## ')) {
          return <H2 key={index}>{parseInline(trimmedLine.substring(3))}</H2>
        }
        if (trimmedLine.startsWith('### ')) {
          return <H3 key={index}>{parseInline(trimmedLine.substring(4))}</H3>
        }

        // List items
        if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          return (
            <XStack key={index} gap="$2" ml="$2">
              <Text>•</Text>
              <Paragraph flex={1}>{parseInline(trimmedLine.substring(2))}</Paragraph>
            </XStack>
          )
        }

        // Paragraphs
        return <Paragraph key={index}>{parseInline(trimmedLine)}</Paragraph>
      })}
    </YStack>
  )
}

import * as Linking from 'expo-linking'

function parseInline(text: string): React.ReactNode {
  // 1. Handle Bold: **text**
  const parts = text.split(/(\*\*.*?\*\*)/g)
  
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          // Remove ** and parse links inside
          const content = part.slice(2, -2)
          return (
            <Text key={i} fontWeight="bold">
              {parseLinks(content)}
            </Text>
          )
        }
        // Parse links in non-bold text
        return <React.Fragment key={i}>{parseLinks(part)}</React.Fragment>
      })}
    </>
  )
}

function parseLinks(text: string): React.ReactNode {
  // 2. Handle Links: [text](url)
  const parts = text.split(/(\[.*?\]\(.*?\))/g)
  
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(.*?)\]\((.*?)\)$/)
        if (match) {
          const [, linkText, url] = match
          return (
            <Text 
              key={i} 
              color="$blue10" 
              textDecorationLine="underline"
              onPress={() => Linking.openURL(url)}
            >
              {linkText}
            </Text>
          )
        }
        return part
      })}
    </>
  )
}
