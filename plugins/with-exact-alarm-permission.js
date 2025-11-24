const {
  withDangerousMod,
  createRunOncePlugin,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_NAME = "ExactAlarmPermission";

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
import android.app.AppOpsManager;
import android.content.Context;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class ${MODULE_NAME}Module extends ReactContextBaseJavaModule {
  public ${MODULE_NAME}Module(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "${MODULE_NAME}";
  }

  @ReactMethod
  public void hasExactAlarmPermission(Promise promise) {
    try {
      Context context = getReactApplicationContext();

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { // S = 31 = Android 12
        promise.resolve(true);
        return;
      }

      AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
      boolean canSchedule = alarmManager != null && alarmManager.canScheduleExactAlarms();

      promise.resolve(canSchedule);
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

public class ${MODULE_NAME}Package implements ReactPackage {

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new ${MODULE_NAME}Module(context));
    return modules;
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }
}
`;
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

    fs.writeFileSync(path.join(javaDir, `${MODULE_NAME}Module.java`), createModuleJava(packageName));
    fs.writeFileSync(path.join(javaDir, `${MODULE_NAME}Package.java`), createPackageJava(packageName));

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
    const contents = mod.modResults.contents;
    
    // Check if already added to avoid duplicates
    if (contents.includes(`${MODULE_NAME}Package`)) {
      return mod;
    }

    // 1. Kotlin: PackageList(this).packages.apply { ... }
    if (contents.includes("PackageList(this).packages.apply {")) {
      mod.modResults.contents = contents.replace(
        "PackageList(this).packages.apply {",
        `PackageList(this).packages.apply {\n              add(${MODULE_NAME}Package())`
      );
    } 
    // 2. Java: new MainReactPackage(), ...
    else if (contents.includes("new MainReactPackage(),")) {
      mod.modResults.contents = contents.replace(
        "new MainReactPackage(),",
        `new MainReactPackage(),
        new ${MODULE_NAME}Package(),`
      );
    }

    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withExactAlarmPermission,
  "with-exact-alarm-permission",
  "1.0.2"
);