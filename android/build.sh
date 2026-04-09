#!/bin/bash
# ── Build Claude Orb APK on Termux ──────────────────────────────
set -e

PROJ="$(cd "$(dirname "$0")" && pwd)"
BUILD="$PROJ/build"
OUT="$PROJ/claude-orb.apk"

# Real android.jar from Google SDK (API 33)
ANDROID_JAR="$PROJ/android-13/android.jar"

echo "==> Cleaning..."
rm -rf "$BUILD"
mkdir -p "$BUILD/compiled" "$BUILD/gen" "$BUILD/obj" "$BUILD/dex"

# ── Resources with aapt2 (proper manifest) ──
echo "==> Compiling resources (aapt2)..."
aapt2 compile --dir "$PROJ/res" -o "$BUILD/compiled/"

echo "==> Linking (aapt2)..."
aapt2 link \
    -I "$ANDROID_JAR" \
    --manifest "$PROJ/AndroidManifest.xml" \
    --java "$BUILD/gen" \
    --auto-add-overlay \
    -o "$BUILD/base.apk" \
    "$BUILD/compiled/"*.flat

# ── Compile Java with ecj (produces dx-compatible bytecode) ──
echo "==> Compiling Java (ecj)..."
find "$PROJ/src" "$BUILD/gen" -name "*.java" > "$BUILD/sources.txt"

dalvikvm -Xmx256m \
    -Xcompiler-option --compiler-filter=speed \
    -cp /data/data/com.termux/files/usr/share/dex/ecj.jar \
    org.eclipse.jdt.internal.compiler.batch.Main \
    -proc:none \
    -7 \
    -bootclasspath "$ANDROID_JAR" \
    -d "$BUILD/obj" \
    -nowarn \
    @"$BUILD/sources.txt"

# ── DEX ──
echo "==> Converting to DEX..."
dx --dex --output="$BUILD/dex/classes.dex" "$BUILD/obj"

# ── Assemble: extract base, add dex, rezip ──
echo "==> Assembling APK..."
mkdir -p "$BUILD/unsigned"
cd "$BUILD/unsigned"
unzip -o "$BUILD/base.apk"
cp "$BUILD/dex/classes.dex" .
# resources.arsc MUST be stored uncompressed (Android requirement)
zip -0 "$BUILD/unsigned.apk" resources.arsc
zip -r "$BUILD/unsigned.apk" AndroidManifest.xml classes.dex res/
cd "$PROJ"

# ── Align ──
echo "==> Aligning..."
zipalign -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"

# ── Sign ──
echo "==> Signing..."
KEYSTORE="$PROJ/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair \
        -keystore "$KEYSTORE" \
        -storepass android \
        -keypass android \
        -alias debug \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -dname "CN=Debug, O=Claude, C=US"
fi

apksigner sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:android \
    --key-pass pass:android \
    --ks-key-alias debug \
    --out "$OUT" \
    "$BUILD/aligned.apk"

# ── Verify ──
echo "==> Verifying..."
apksigner verify "$OUT" 2>&1
aapt2 dump badging "$OUT" 2>&1 | head -6
echo ""
unzip -l "$OUT"

echo ""
echo "=== BUILD SUCCESS ==="
echo "APK: $OUT"
