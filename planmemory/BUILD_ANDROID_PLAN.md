# Building redglitch ENGINE for Android

This guide explains how to build the redglitch ENGINE (Editor + Runtime) for Android using Capacitor.
The system has been configured to use a "FileSystem Adapter" (`android-adapter.bundle.js`) which mimics the Node.js server operations using the Android device's storage.

## Prerequisites

1.  **Node.js & NPM** (Already installed)
2.  **Android Studio** (Required for the final APK build/signing)
3.  **Capacitor CLI** (Installed in the project)

## How it Works

-   **Desktop/Web:** The app communicates with `server.js` via `fetch('/api/...')`.
-   **Android:** The app uses `js/android-adapter.bundle.js` to intercept these `fetch` calls. Instead of hitting a server, it uses `@capacitor/filesystem` to read/write files in `Documents/RedGlitchEngine`.

## Build Steps

### 1. Bundle the Adapter (If you changed src-android/adapter.js)
If you modified the adapter logic, rebuild the bundle:
```bash
node build-adapter.js
```

### 2. Sync with Capacitor
This command copies the `public` folder to the Android native project.
```bash
npx cap sync android
```
*Note: If this is the first time, run `npx cap add android` first.*

### 3. Open in Android Studio
This will launch Android Studio with the project ready to build.
```bash
npx cap open android
```

### 4. Build & Run
Inside Android Studio:
1.  Wait for Gradle sync to finish.
2.  Connect your Android device or start an Emulator.
3.  Click the **Run** button (green play icon).

## File Permissions
On Android 10+, the app is scoped to its own storage or specific public collections.
The adapter is configured to use `Directory.Documents` and creates a folder named `RedGlitchEngine`.

-   **Projects:** Stored in `Documents/RedGlitchEngine/`.
-   **Levels:** Stored in `Documents/RedGlitchEngine/[ProjectName]/dunyalar/`.

## Debugging on Android
You can debug the WebView using Chrome DevTools on your PC:
1.  Connect device via USB.
2.  Open Chrome on PC and go to `chrome://inspect`.
3.  Click "Inspect" under your device/webview.
