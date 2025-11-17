import React from 'react'
import { YStack, XStack, Text, Paragraph, ScrollView, Button, Separator } from 'tamagui'
import { Link } from 'expo-router'
import { Ruler, Timer as TimerIcon, LogOut, ChevronRight, Globe } from '@tamagui/lucide-icons'
import { useAuth } from '../../../contexts/AuthContext'

function MenuRow({
  icon,
  title,
  description,
  href,
  onPress,
  danger = false,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  href?: string
  onPress?: () => void
  danger?: boolean
}) {
  const baseBg = danger ? '$red8' : '$surface'
  const hoverBg = danger ? '$red9' : '$surfaceHover'
  const pressBg = danger ? '$red9' : '$surfacePress'

  const inner = (
    <XStack
      p="$3"
      gap="$3"
      style={{ alignItems: 'center', justifyContent: 'space-between', borderRadius: 12 }}
    >
      <XStack gap="$3" flex={1} style={{ alignItems: 'center' }}>
        {icon}
        <YStack flex={1} gap="$1">
          <Text fontWeight="700">{title}</Text>
          {description && (
            <Paragraph size="$2" color="$color11">
              {description}
            </Paragraph>
          )}
        </YStack>
      </XStack>
      {href && <ChevronRight size={18} color="$color" />}
    </XStack>
  )

  if (href) {
    return (
      <Link href={href as any} asChild>
        <Button
          unstyled
          bg={baseBg}
          hoverStyle={{ bg: hoverBg }}
          pressStyle={{ bg: pressBg }}
          animation="quick"
          style={{ borderRadius: 12, padding: 0 }}
        >
          {inner}
        </Button>
      </Link>
    )
  }
  return (
    <Button
      unstyled
      onPress={onPress}
      bg={baseBg}
      hoverStyle={{ bg: hoverBg }}
      pressStyle={{ bg: pressBg }}
      animation="quick"
      style={{ borderRadius: 12, padding: 0 }}
    >
      {inner}
    </Button>
  )
}

export default function SettingsMenuScreen() {
  const { logout, user } = useAuth()

  const fullName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email
    : 'User'
  const email = user?.email
  const initials = React.useMemo(() => {
    if (!user) return 'U'
    const first = (user.firstName || user.username || user.email || 'U').trim()
    const last = (user.lastName || '').trim()
    const firstChar = first.charAt(0)
    const lastChar = last ? last.charAt(0) : ''
    return (firstChar + lastChar).toUpperCase()
  }, [user])
  return (
    <YStack flex={1} bg="$background">
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack p="$4" gap="$5">
          {/* Profile header card */}
          <YStack bg="$backgroundStrong" p="$4" gap="$2" style={{ borderRadius: 12 }}>
            <XStack gap="$3" style={{ alignItems: 'center' }}>
              <YStack
                bg="$background"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text fontSize="$6" fontWeight="700">
                  {initials}
                </Text>
              </YStack>
              <YStack flex={1} gap="$1">
                <Text fontSize="$6" fontWeight="700">
                  {fullName}
                </Text>
                {!!email && (
                  <Paragraph size="$2" color="$color11">
                    {email}
                  </Paragraph>
                )}
              </YStack>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <Text fontSize="$3" color="$color11" fontWeight="700">
              General
            </Text>
            <MenuRow
              icon={<Ruler size={18} color="$color" />}
              title="Body measurements"
              description="Edit weight & height units"
              href="/settings/body"
            />
            <MenuRow
              icon={<Globe size={18} color="$color" />}
              title="Time zone"
              description="Choose display timezone"
              href="/settings/time-zone"
            />
            <MenuRow
              icon={<TimerIcon size={18} color="$color" />}
              title="Rest timer"
              description="Configure rest duration"
              href="/settings/rest-timer"
            />
          </YStack>

          <Separator />

          <MenuRow
            icon={<LogOut size={18} />}
            title="Sign out"
            description="Log out of your account"
            onPress={() => {
              console.log('test')
              logout()
            }}
            danger
          />
        </YStack>
      </ScrollView>
    </YStack>
  )
}
