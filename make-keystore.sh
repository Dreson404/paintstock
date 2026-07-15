#!/usr/bin/env bash
# Run this ONCE on a machine with Java (your PC, or GitHub Codespaces) to create
# the upload keystore, then base64 it for the GitHub secret KEYSTORE_BASE64.
set -e
keytool -genkeypair -v -keystore keystore.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias paintstock \
  -dname "CN=CMN, OU=PaintStock, O=CMN, L=Hamilton, ST=Waikato, C=NZ"
echo "--- base64 for GitHub secret KEYSTORE_BASE64: ---"
base64 -w0 keystore.jks
echo
echo "Remember the keystore password and key password you entered."
