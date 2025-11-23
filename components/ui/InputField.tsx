import React from 'react'
import { XStack, Input } from 'tamagui'

export const InputField = ({ icon: Icon, ...props }: any) => (
  <XStack
    bg="$color3"
    borderColor="$color5"
    borderWidth={1}
    rounded="$4"
    items="center"
    px="$3"
    animation="fast"
    pressStyle={{ borderColor: '$blue9' }}
    focusStyle={{ borderColor: '$blue9' }}
  >
    {Icon && <Icon size={20} color="$color9" />}
    <Input
      flex={1}
      unstyled
      py="$3"
      px="$3"
      color="$color12"
      placeholderTextColor="$color9"
      {...props}
    />
  </XStack>
)
