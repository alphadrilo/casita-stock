#!/bin/bash
# Casita Stock — abre el proyecto en Xcode.
# Uso: doble clic en el Finder (la primera vez: clic derecho → Abrir).
# Desde la versión 1.2.1 solo necesitas Xcode: el proyecto ya trae la app copiada
# y la voz va dentro de la app (sin CocoaPods). Node.js es opcional.
cd "$(dirname "$0")" || exit 1
cerrar() { echo; read -n 1 -s -r -p "Toca cualquier tecla para cerrar esta ventana"; echo; exit "$1"; }
falta() { echo; echo "⚠️  $1"; cerrar 1; }

echo "Casita Stock $(grep -m1 '"version"' package.json | cut -d'"' -f4) — abrir en Xcode"
echo "------------------------------------------------"
[ -d /Applications/Xcode.app ] || command -v xcodebuild >/dev/null 2>&1 || falta "Falta Xcode. Instálalo desde la App Store, ábrelo una vez y vuelve a abrir este archivo."
[ -f ios/App/App/public/index.html ] || falta "Falta la carpeta ios/App/App/public. Vuelve a descomprimir el zip completo."

if grep -q 'CS_SERVIDOR = "";' web/js/config-nativo.js; then
  echo "ℹ️  web/js/config-nativo.js no tiene la dirección de Vercel: la app abrirá en modo demo (sin IA ni cuentas)."
  echo
fi

# Si cambiaste algo en web/ y tienes Node.js, se copia a la app. Si no, se usa la copia que ya trae.
if command -v node >/dev/null 2>&1; then
  echo "Copiando la app web al proyecto de iPhone…"
  if [ ! -d node_modules/@capacitor/cli ]; then npm install --no-audit --no-fund >/dev/null 2>&1; fi
  npx cap copy ios >/dev/null 2>&1 && echo "✔ Copiada." || echo "ℹ️  No se pudo copiar; se usa la copia que ya trae el proyecto."
else
  echo "ℹ️  Sin Node.js: se usa la copia de la app que ya trae el proyecto (está bien)."
fi

pkill -x Xcode >/dev/null 2>&1 && sleep 2
echo "Abriendo Xcode…"
open ios/App/App.xcodeproj || falta "No se pudo abrir Xcode."
echo
echo "✅ Listo. En Xcode:"
echo "   1. Espera a que termine 'Resolving Package Graph' (abajo o arriba; la primera vez baja Capacitor de internet)."
echo "   2. Toca App (ícono azul) → Signing & Capabilities → elige tu Team y cambia el Bundle Identifier."
echo "   3. Elige un iPhone arriba y toca ▶."
cerrar 0
