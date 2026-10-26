const { withDangerousMod } = require('expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

const vector = (body) => `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="32dp" android:height="32dp" android:viewportWidth="32" android:viewportHeight="32">
  ${body}
</vector>\n`
const stroke = (
  data,
  width = 1.8
) => `<path android:pathData="${data}" android:fillColor="@android:color/transparent"
  android:strokeColor="#000000" android:strokeWidth="${width}" android:strokeLineCap="round" android:strokeLineJoin="round"/>`
const icons = {
  training: vector(
    `<group android:rotation="-30" android:pivotX="16" android:pivotY="16">${stroke('M10,16h12 M7,8v16 M12,11v10 M20,11v10 M25,8v16 M3,13v6 M29,13v6', 3.3)}</group>`
  ),
  rest: vector(
    stroke('M24,21.5A11,11 0,0 1,11 6 A11,11 0,1 0,24 21.5Z') + stroke('M23,5v6 M20,8h6', 1.5)
  ),
  empty: vector(
    stroke('M10,4h12 Q28,4 28,10v12 Q28,28 22,28H10 Q4,28 4,22V10 Q4,4 10,4Z', 1.5) +
      stroke('M16,10v12 M10,16h12', 1.5)
  ),
  chevron: vector(stroke('M12,8l8,8 -8,8', 3)),
  plus: vector(stroke('M16,6v20 M6,16h20', 3)),
}

module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    async (mod) => {
      const androidRoot = mod.modRequest.platformProjectRoot
      const drawable = path.join(androidRoot, 'app/src/main/res/drawable')
      fs.mkdirSync(drawable, { recursive: true })
      for (const [name, xml] of Object.entries(icons)) {
        fs.writeFileSync(path.join(drawable, `widget_${name}_icon.xml`), xml)
      }
      // Expo's Android widget buttons broadcast interactions but don't offer deep links.
      const packageName = mod.android.package
      const provider = path.join(
        androidRoot,
        'app/src/main/java',
        ...packageName.split('.'),
        'TodayPlanProvider.kt'
      )
      fs.writeFileSync(
        provider,
        `package ${packageName}

import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.widgets.ExpoWidgetsAppWidgetProvider

class TodayPlanProvider : ExpoWidgetsAppWidgetProvider("TodayPlan") {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == "expo.modules.widgets.ACTION_WIDGET_INTERACTION") {
      val target = intent.getStringExtra("expo.modules.widgets.extra.TARGET")
      if (target != null) {
        val uri = Uri.parse(target)
        if (uri.scheme == "activenext" && uri.host in setOf("workouts", "routines")) {
          context.startActivity(
            Intent(Intent.ACTION_VIEW, uri)
              .setPackage(context.packageName)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          )
          return
        }
      }
    }
    super.onReceive(context, intent)
  }
}
`
      )
      return mod
    },
  ])
