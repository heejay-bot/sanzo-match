Sanzo Match

Run: python3 -m http.server 8000  -> http://localhost:8000
Data: mattdesl/dictionary-of-colour-combinations

## Android app (Capacitor)
Data is stored in app-private storage (Preferences plugin), not the browser.

Build (tools installed under ~/.local/android-tools):
    export JAVA_HOME=$(ls -d ~/.local/android-tools/jdk-21*/Contents/Home)
    export ANDROID_HOME=~/.local/android-tools/sdk
    npm run apk   # -> android/app/build/outputs/apk/debug/app-debug.apk
