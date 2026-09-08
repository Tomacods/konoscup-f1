# KonosCup · F1 25

Tracker del campeonato de la liga KonosCup (Racenet / F1 25). Sitio estático en Vercel con los
datos en Firebase Firestore, sincronizado en vivo: vos cargás un resultado y a todos los que
tengan la página abierta se les actualiza la tabla sola.

- **Pilotos** — campeonato individual con victorias, podios, poles, vueltas rápidas y ajustes.
- **Constructores** — suma por equipo, con promedio por piloto para comparar equipos con distinta cantidad de pilotos.
- **Calendario** — las 24 fechas de 2025, con las 6 que llevan sprint (China, Miami, Bélgica, Austin, Brasil y Qatar).
- **Grilla** — matriz de puntos fecha por fecha.

Puntaje: `25-18-15-12-10-8-6-4-2-1` en carrera y `8-7-6-5-4-3-2-1` en sprint. Sin punto por vuelta
rápida, igual que el reglamento 2025. Pole y vuelta rápida se registran sólo como estadística.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página |
| `styles.css` | Estilos |
| `app.js` | Toda la lógica: Firestore, cálculo del campeonato y edición |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |

## Puesta en marcha (una sola vez)

### 1. Habilitar el login de admin en Firebase

En la [consola de Firebase](https://console.firebase.google.com/project/konoscup-f1/authentication/providers):

1. **Authentication → Get started**.
2. En **Sign-in method**, habilitá **Email/Password** (sólo la primera opción; el link mágico no hace falta).
3. En **Users → Add user**, creá una cuenta para vos con tu email y una contraseña.
4. Repetí el paso 3 por cada persona que quieras que pueda cargar resultados (por ejemplo Cesar).

Esas son las únicas cuentas que van a poder escribir. El resto entra al link y ve todo, sin login.

### 2. Pegar las reglas de Firestore

En **Firestore Database → Rules**, reemplazá lo que haya por el contenido de `firestore.rules` y
apretá **Publish**.

> Ojo: si las reglas quedan en modo de prueba (`allow read, write: if true`), cualquiera con el
> link puede escribirte la base. Las reglas de este repo dejan la lectura abierta y la escritura
> sólo para las cuentas que creaste arriba.

### 3. Subir a Vercel

El repo ya está conectado. Commiteás y pusheás, y Vercel redeploya solo:

```bash
git add -A
git commit -m "Tracker completo: constructores, calendario, sprints y modo admin"
git push
```

En Vercel el proyecto tiene que estar como **Framework Preset: Other**, sin build command y con
el root del repo como Output Directory. Es HTML plano, no hay nada que compilar.

## Cómo se usa

- **Ver la tabla**: le pasás el link de Vercel a los pibes. No necesitan cuenta ni nada.
- **Cargar una fecha**: tocás **Modo admin**, entrás con tu email y contraseña, vas a **Calendario**
  y tocás la fecha. Ponés la posición final de cada uno (la del juego, con los AI incluidos),
  el sprint si la fecha lo tiene, y quién hizo la pole y la vuelta rápida. **Guardar**.
- **Penalizaciones**: en **Pilotos → Editar pilotos** hay una columna de ajuste para sumar o
  restar puntos a mano.
- **Cambiar la parrilla**: mismo lugar. Podés agregar pilotos, sacarlos o cambiarles el auto.
  Si sacás a alguien, se borran también sus resultados.

## Notas técnicas

Los datos viven en un solo documento, `konoscup/v1`:

```js
{
  drivers: [{ id, name, team, adj }],
  results: { [driverId]: { [nroDeFecha]: posicion } },  // carrera
  sprints: { [driverId]: { [nroDeFecha]: posicion } },  // sprint
  poles:   { [nroDeFecha]: driverId },
  fastest: { [nroDeFecha]: driverId },
  points: [25, 18, ...],
  sprintPoints: [8, 7, ...]
}
```

Las fechas se numeran de `0` a `23` siguiendo el calendario del array `RACES` en `app.js`. Si
alguna vez corren un calendario distinto, cambiás ese array y listo.

El desempate es por countback, igual que la FIA: primero puntos, después quién tiene más
victorias, después más segundos puestos, y así.

La `apiKey` de Firebase está en el código a propósito: en Firebase no es un secreto, es un
identificador público del proyecto. Lo que protege la base son las reglas de Firestore.
