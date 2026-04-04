# Sopas de letras para primaria

Pequeña app web sin dependencias para crear sopas de letras para alumnado de primaria.

## Uso

1. Abre `index.html` en el navegador del portátil.
2. Escribe un tema y una lista de palabras.
3. Pulsa `Generar sopa`.
4. Usa `Modo alumno` para resolverla en pantalla o `Imprimir / PDF` para llevarla a papel.

## Datos editables

- El vocabulario de la biblioteca y los ejemplos viven en `data.js`.
- Los textos multiidioma viven en `i18n.js`.
- La lógica de generación e interacción vive en `app.js`.

## Ejemplos guardados por la profesora

- `Guardar aquest exemple` no escribe en `data.js`.
- Los ejemplos personalizados se guardan en el navegador del portátil usando `localStorage`.
- Eso significa que siguen disponibles al recargar la página en ese mismo ordenador.
- Para moverlos a otro portátil, usa `Exportar JSON` e `Importar JSON`.

## Si el navegador muestra avisos con `file://`

Algunos navegadores aplican restricciones extra cuando se abre un HTML local con doble clic. Si aparece alguna advertencia en consola, puedes abrir la carpeta con un servidor local muy simple:

```bash
cd /Users/edgardpuig/repos/rachel_exercises
python3 -m http.server 8000
```

Después abre `http://localhost:8000` en el navegador.

## Qué incluye

- Generación automática de la rejilla.
- Dificultad fácil, media y difícil.
- Resolución en pantalla con clics o arrastre.
- Vista de profesora con solución visible.
- Impresión o guardado en PDF desde el navegador.
