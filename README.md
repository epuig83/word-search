# Sopas de letras para primaria

Pequeña app web sin dependencias para crear sopas de letras para alumnado de primaria.

## Uso

1. Abre `index.html` en el navegador del portátil.
2. Escribe un tema y una lista de palabras, o usa la biblioteca lateral para añadir vocabulario.
3. Pulsa `Generar nova sopa` para prepararla en la vista de profesora, o `Generar i obrir zona alumne` para lanzarla directamente.
4. En la zona de alumno se puede resolver con ratón, táctil o teclado (`flechas` + `Enter`).
5. Cuando esté lista, usa `Compartir` o `Imprimir / PDF`.

## Datos editables

- El vocabulario de la biblioteca y los ejemplos viven en `data.js`.
- Los textos multiidioma viven en `i18n.js`.
- La lógica de generación e interacción vive en `app.js`.

## Ejemplos guardados por la profesora

- `Guardar` no escribe en `data.js`.
- Los ejemplos personalizados se guardan en el navegador del portátil usando `localStorage`.
- Eso significa que siguen disponibles al recargar la página en ese mismo ordenador.
- Para moverlos a otro portátil, usa `Exportar JSON` e `Importar JSON`.

## Flujo de aula

- La tarjeta `Activitat preparada` resume la sopa activa y da acceso rápido a abrir la zona de alumno, compartir o imprimir.
- Los enlaces de `Compartir` reconstruyen exactamente la misma sopa al abrirlos.
- Si configuras Google Forms, al terminar la actividad se puede enviar el resultado desde la vista de alumno.

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
- Resolución en pantalla con ratón, táctil o teclado.
- Apertura directa de la zona de alumno al generar.
- Vista de profesora con solución visible y acciones rápidas.
- Enlaces compartibles que preservan la misma sopa.
- Impresión o guardado en PDF desde el navegador.
