import DateTimePicker from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform } from 'react-native'
import { Button, Text, View, XStack, YStack } from 'tamagui'

interface DatePickerFieldProps {
  label: string
  value: Date
  onChange: (date: Date) => void
}

export function DatePickerField({ label, value, onChange }: DatePickerFieldProps) {
  const [show, setShow] = useState(false)

  const handleChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || value
    if (Platform.OS === 'android') {
      setShow(false)
    }
    onChange(currentDate)
  }

  return (
    <YStack gap="$2">
      <Text fontSize="$3" color="$color10" fontWeight="600">
        {label}
      </Text>
      
      {Platform.OS === 'android' && (
        <Button onPress={() => setShow(true)} chromeless bordered>
          <Text>{value.toLocaleDateString()}</Text>
        </Button>
      )}

      {(show || Platform.OS === 'ios') && (
        <DateTimePicker
          testID="dateTimePicker"
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'default' : 'default'}
          onChange={handleChange}
          style={Platform.OS === 'ios' ? { alignSelf: 'flex-start' } : undefined}
        />
      )}
    </YStack>
  )
}
