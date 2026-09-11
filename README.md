# AstroMeteo

App móvil y web para decidir rápidamente si merece la pena hacer astrofotografía esta noche. Usa la ubicación GPS del dispositivo y combina meteorología convencional con indicadores astronómicos.

## Incluye

- Veredicto inmediato y mejor franja horaria nocturna.
- Puntuaciones separadas para planetaria y cielo profundo.
- Nubosidad total y por capas, precipitación, humedad y margen al punto de rocío.
- Seeing astronómico, jet stream a 250 hPa, viento, rachas, temperatura y visibilidad.
- Iluminación y fase lunar.
- PWA instalable, GitHub Pages y proyecto Android con Capacitor.

## Desarrollo

```bash
npm install
npm run dev
```

## Web y GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` compila y publica cada push a `main`. En GitHub activa **Settings → Pages → Source → GitHub Actions**.

```bash
npm run build
```

## Android

La primera vez:

```bash
npm install
npx cap add android
npm run android:sync
npm run android:open
```

Después de cualquier cambio web basta con ejecutar `npm run android:sync`. Para publicar en Google Play, genera un Android App Bundle firmado desde Android Studio.

## Fuentes

- Open-Meteo para meteorología, capas de nubes, Luna y viento a 250 hPa.
- 7Timer para la estimación de seeing. Si no está disponible, la interfaz lo indica y utiliza el jet stream solo como referencia.

Los índices de planetaria y cielo profundo son ayudas orientativas, no mediciones locales.
