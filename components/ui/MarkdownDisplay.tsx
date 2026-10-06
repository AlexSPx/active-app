import React from 'react'
import { YStack, Text, Paragraph, Separator, XStack } from 'tamagui'

interface MarkdownDisplayProps {
  content: string
}

export function MarkdownDisplay({ content }: MarkdownDisplayProps) {
  if (!content) return null

  const lines = content.split('\n')

  return (
    <YStack gap="$card">
      {lines.map((line, index) => {
        const trimmedLine = line.trim()
        if (!trimmedLine) return null

        // Headers
        if (trimmedLine.startsWith('# ')) {
          return (
            <Text
              key={index}
              accessibilityRole="header"
              fontSize="$sectionTitle"
              lineHeight="$sectionTitle"
              fontWeight="600"
            >
              {parseInline(trimmedLine.substring(2))}
            </Text>
          )
        }
        if (trimmedLine.startsWith('## ')) {
          return (
            <Text
              key={index}
              accessibilityRole="header"
              mt="$field"
              fontSize="$cardTitle"
              lineHeight="$cardTitle"
              fontWeight="600"
            >
              {parseInline(trimmedLine.substring(3))}
            </Text>
          )
        }
        if (trimmedLine.startsWith('### ')) {
          return (
            <Text
              key={index}
              accessibilityRole="header"
              mt="$field"
              fontSize="$body"
              lineHeight="$body"
              fontWeight="600"
            >
              {parseInline(trimmedLine.substring(4))}
            </Text>
          )
        }

        if (trimmedLine === '---') return <Separator key={index} borderColor="$borderColor" />

        // List items
        if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          return (
            <XStack key={index} gap="$2" ml="$2">
              <Text fontSize="$body" lineHeight="$body">
                •
              </Text>
              <Paragraph flex={1} fontSize="$body" lineHeight="$body">
                {parseInline(trimmedLine.substring(2))}
              </Paragraph>
            </XStack>
          )
        }

        // Paragraphs
        return (
          <Paragraph key={index} fontSize="$body" lineHeight="$body">
            {parseInline(trimmedLine)}
          </Paragraph>
        )
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
              color="$primary"
              textDecorationLine="underline"
              accessibilityRole="link"
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
