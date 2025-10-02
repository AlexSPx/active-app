import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProgressionMetric = 'oneRm' | 'volume' | 'maxWeight'

export interface WidgetConfig {
  id: string
  exerciseId: string
  exerciseName: string
  metric: ProgressionMetric
  position: number
  createdAt: string
}

interface WidgetStore {
  // State
  widgets: WidgetConfig[]

  // Actions
  addWidget: (exerciseId: string, exerciseName: string, metric?: ProgressionMetric) => string
  removeWidget: (widgetId: string) => void
  updateWidget: (widgetId: string, updates: Partial<Omit<WidgetConfig, 'id' | 'createdAt'>>) => void
  reorderWidgets: (widgetIds: string[]) => void
  getWidget: (widgetId: string) => WidgetConfig | undefined
  getWidgetsByExercise: (exerciseId: string) => WidgetConfig[]
  clearAllWidgets: () => void
}

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      // Initial state
      widgets: [],

      // Actions
      addWidget: (
        exerciseId: string,
        exerciseName: string,
        metric: ProgressionMetric = 'oneRm'
      ) => {
        const state = get()

        // Check if widget for this exercise and metric already exists
        const existingWidget = state.widgets.find(
          (w) => w.exerciseId === exerciseId && w.metric === metric
        )

        if (existingWidget) {
          return existingWidget.id
        }

        // Create new widget
        const newWidget: WidgetConfig = {
          id: `widget_${exerciseId}_${metric}_${Date.now()}`,
          exerciseId,
          exerciseName,
          metric,
          position: state.widgets.length,
          createdAt: new Date().toISOString(),
        }

        set({
          widgets: [...state.widgets, newWidget],
        })

        return newWidget.id
      },

      removeWidget: (widgetId: string) => {
        const state = get()
        const updatedWidgets = state.widgets.filter((w) => w.id !== widgetId)

        // Reorder remaining widgets to fill gaps
        const reorderedWidgets = updatedWidgets.map((widget, index) => ({
          ...widget,
          position: index,
        }))

        set({ widgets: reorderedWidgets })
      },

      updateWidget: (
        widgetId: string,
        updates: Partial<Omit<WidgetConfig, 'id' | 'createdAt'>>
      ) => {
        const state = get()
        set({
          widgets: state.widgets.map((w) => (w.id === widgetId ? { ...w, ...updates } : w)),
        })
      },

      reorderWidgets: (widgetIds: string[]) => {
        const state = get()
        const widgetMap = new Map(state.widgets.map((w) => [w.id, w]))

        const reorderedWidgets = widgetIds
          .map((id, index) => {
            const widget = widgetMap.get(id)
            return widget ? { ...widget, position: index } : null
          })
          .filter(Boolean) as WidgetConfig[]

        // Add any widgets that weren't in the reorder list
        const missingWidgets = state.widgets.filter((w) => !widgetIds.includes(w.id))
        const finalWidgets = [
          ...reorderedWidgets,
          ...missingWidgets.map((w, index) => ({
            ...w,
            position: reorderedWidgets.length + index,
          })),
        ]

        set({ widgets: finalWidgets })
      },

      getWidget: (widgetId: string) => {
        return get().widgets.find((w) => w.id === widgetId)
      },

      getWidgetsByExercise: (exerciseId: string) => {
        return get().widgets.filter((w) => w.exerciseId === exerciseId)
      },

      clearAllWidgets: () => {
        set({ widgets: [] })
      },
    }),
    {
      name: 'widget-storage',
      partialize: (state) => ({
        widgets: state.widgets,
      }),
    }
  )
)

// Utility functions
export const getMetricLabel = (metric: ProgressionMetric): string => {
  switch (metric) {
    case 'oneRm':
      return '1RM'
    case 'volume':
      return 'Volume'
    case 'maxWeight':
      return 'Max Weight'
    default:
      return metric
  }
}

export const getMetricUnit = (metric: ProgressionMetric): string => {
  switch (metric) {
    case 'oneRm':
    case 'maxWeight':
      return 'kg'
    case 'volume':
      return 'kg'
    default:
      return ''
  }
}
