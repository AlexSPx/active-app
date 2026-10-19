import DateTimePicker from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Button, UiText } from './Controls'

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
    <View className="gap-compact">
      <UiText textRole="bodyEmphasis" className="text-muted">
        {label}
      </UiText>

      {Platform.OS === 'android' && (
        <Button
          variant="surface"
          onPress={() => setShow(true)}
          accessibilityLabel={`${label}, ${value.toLocaleDateString()}`}
        >
          {value.toLocaleDateString()}
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
    </View>
  )
}
