const {
  withDangerousMod,
  createRunOncePlugin,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_NAME = "ExactAlarm";
const MODULE_CLASS_NAME = `${MODULE_NAME}Module`;
const PACKAGE_CLASS_NAME = `${MODULE_NAME}Package`;

function getPackagePath(packageName) {
  return packageName.replace(/\./g, "/");
}

function addManifestPermission(manifest) {
  if (manifest.includes("android.permission.SCHEDULE_EXACT_ALARM")) return manifest;

  return manifest.replace(
    "</manifest>",
    `    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>\n</manifest>`
  );
}

function createModuleJava(packageName) {
  return `
package ${packageName};

import android.app.AlarmManager;
import android.content.Context;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class ${MODULE_CLASS_NAME} extends ReactContextBaseJavaModule {
  public ${MODULE_CLASS_NAME}(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "${MODULE_NAME}";
  }

  @ReactMethod
  public void canScheduleExactAlarms(Promise promise) {
    try {
      Context context = getReactApplicationContext();

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { // S = 31 = Android 12
        promise.resolve(true);
        return;
      }

      AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
      promise.resolve(alarmManager != null && alarmManager.canScheduleExactAlarms());
    } catch (Exception e) {
      promise.reject("ERR_EXACT_ALARM_CHECK", e);
    }
  }
}
`;
}

function createPackageJava(packageName) {
  return `
package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class ${PACKAGE_CLASS_NAME} implements ReactPackage {

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new ${MODULE_CLASS_NAME}(context));
    return modules;
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
`;
}

function updateMainApplication(contents, packageName) {
  const importLine = `import ${packageName}.${PACKAGE_CLASS_NAME}`
  const oldImportLine = `import ${packageName}.ExactAlarmPermissionPackage`
  const addLine = `add(${PACKAGE_CLASS_NAME}())`
  const oldAddLine = "add(ExactAlarmPermissionPackage())"

  let updated = contents.replace(oldImportLine, importLine)
  updated = updated.replace(oldAddLine, addLine)

  if (!updated.includes(importLine)) {
    if (updated.includes("import expo.modules.ReactNativeHostWrapper")) {
      updated = updated.replace(
        "import expo.modules.ReactNativeHostWrapper",
        `import expo.modules.ReactNativeHostWrapper\n${importLine}`
      )
    } else {
      updated = updated.replace(
        /^package [^\n]+\n/m,
        (match) => `${match}\n${importLine}\n`
      )
    }
  }

  if (!updated.includes(addLine) && updated.includes("PackageList(this).packages.apply {")) {
    updated = updated.replace(
      "PackageList(this).packages.apply {",
      `PackageList(this).packages.apply {\n              ${addLine}`
    )
  }

  if (!updated.includes(addLine) && updated.includes("new MainReactPackage(),")) {
    updated = updated.replace(
      "new MainReactPackage(),",
      `new MainReactPackage(),\n        new ${PACKAGE_CLASS_NAME}(),`
    )
  }

  return updated;
}

function withExactAlarmPermission(config) {
  // ----------------------------
  // 1) Modify AndroidManifest
  // ----------------------------
  config = withDangerousMod(config, ["android", (mod) => {
    const manifestPath = path.join(
      mod.modRequest.platformProjectRoot,
      "app/src/main/AndroidManifest.xml"
    );

    const contents = fs.readFileSync(manifestPath, "utf8");
    fs.writeFileSync(manifestPath, addManifestPermission(contents));

    return mod;
  }]);

  // ----------------------------
  // 2) Add Java module + package
  // ----------------------------
  config = withDangerousMod(config, ["android", (mod) => {
    const projectRoot = mod.modRequest.platformProjectRoot;
    const packageName = mod.android.package;
    const pkgPath = getPackagePath(packageName);

    const javaDir = path.join(projectRoot, `app/src/main/java/${pkgPath}`);
    fs.mkdirSync(javaDir, { recursive: true });

    fs.writeFileSync(path.join(javaDir, `${MODULE_CLASS_NAME}.java`), createModuleJava(packageName));
    fs.writeFileSync(path.join(javaDir, `${PACKAGE_CLASS_NAME}.java`), createPackageJava(packageName));

    // AndroidManifest
    const manifestPath = path.join(projectRoot, "app/src/main/AndroidManifest.xml");
    const manifestContents = fs.readFileSync(manifestPath, "utf8");
    fs.writeFileSync(manifestPath, addManifestPermission(manifestContents));

    return mod;
  }]);

  // ----------------------------
  // 3) Register package in MainApplication
  // ----------------------------
  config = withMainApplication(config, (mod) => {
    mod.modResults.contents = updateMainApplication(mod.modResults.contents, mod.android.package);
    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withExactAlarmPermission,
  "with-exact-alarm-permission",
  "1.0.2"
);
