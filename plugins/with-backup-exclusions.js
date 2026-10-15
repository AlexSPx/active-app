const {
  createRunOncePlugin,
  withAndroidManifest,
  withAppDelegate,
  withDangerousMod,
} = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const ANDROID_FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="." />
  <exclude domain="file" path="." />
  <exclude domain="database" path="." />
  <exclude domain="sharedpref" path="." />
  <exclude domain="external" path="." />
</full-backup-content>
`

const ANDROID_DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." />
    <exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." />
    <exclude domain="device_sharedpref" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." />
    <exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." />
    <exclude domain="device_sharedpref" path="." />
  </device-transfer>
</data-extraction-rules>
`

const IOS_BACKUP_MARKER = 'ActiveNextBackupExclusions.apply()'
const IOS_BACKUP_HELPER = `

private enum ActiveNextBackupExclusions {
  static func apply() {
    let fileManager = FileManager.default
    let directories = [
      fileManager.urls(for: .documentDirectory, in: .userDomainMask).first,
      fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first,
    ].compactMap { $0 }

    for directory in directories {
      var resourceValues = URLResourceValues()
      resourceValues.isExcludedFromBackup = true
      var mutableDirectory = directory
      do {
        try mutableDirectory.setResourceValues(resourceValues)
      } catch {
        NSLog("Could not exclude app data from backup at %@: %@", directory.path, String(describing: error))
      }
    }
  }
}
`

function withAndroidBackupExclusions(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0]
    if (!application?.$) {
      throw new Error('Could not find the Android application manifest element')
    }

    application.$['android:allowBackup'] = 'false'
    application.$['android:fullBackupContent'] = '@xml/active_next_backup_rules'
    application.$['android:dataExtractionRules'] = '@xml/active_next_data_extraction_rules'
    return mod
  })

  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const xmlDirectory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      await fs.promises.mkdir(xmlDirectory, { recursive: true })
      await Promise.all([
        fs.promises.writeFile(
          path.join(xmlDirectory, 'active_next_backup_rules.xml'),
          ANDROID_FULL_BACKUP_CONTENT
        ),
        fs.promises.writeFile(
          path.join(xmlDirectory, 'active_next_data_extraction_rules.xml'),
          ANDROID_DATA_EXTRACTION_RULES
        ),
      ])
      return mod
    },
  ])
}

function withIosBackupExclusions(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents
    if (contents.includes(IOS_BACKUP_MARKER)) return mod

    const launchMethod = contents.indexOf('didFinishLaunchingWithOptions')
    const methodBodyStart = contents.indexOf('{', launchMethod)
    if (launchMethod < 0 || methodBodyStart < 0) {
      throw new Error('Could not find the Swift AppDelegate launch method for backup exclusions')
    }

    contents = `${contents.slice(0, methodBodyStart + 1)}\n    ${IOS_BACKUP_MARKER}\n${contents.slice(methodBodyStart + 1)}`
    if (!contents.includes('import Foundation')) contents = `import Foundation\n${contents}`
    mod.modResults.contents = `${contents.trimEnd()}${IOS_BACKUP_HELPER}\n`
    return mod
  })
}

function withBackupExclusions(config) {
  config = withAndroidBackupExclusions(config)
  return withIosBackupExclusions(config)
}

module.exports = createRunOncePlugin(withBackupExclusions, 'with-backup-exclusions', '1.0.0')
