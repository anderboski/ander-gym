/**
 * Release notes shown in the "What's new" popup (App.tsx) and the full
 * changelog sheet reachable from Settings. Keep this in sync with
 * `package.json`'s `version` — every version bump should add an entry here in
 * the same commit, the same discipline as SPEC.md.
 *
 * Oldest first: `unseenEntries` relies on that order to pop the queue up in
 * the right sequence, and `ChangelogSheet` reverses it for newest-first
 * display.
 */

export type ChangelogEntry = {
  version: string;
  /** `YYYY-MM-DD`, the date this version shipped. */
  date: string;
  en: string[];
  es: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-08-02',
    en: [
      'Track your training days and log sets during a workout.',
      'Browse a catalogue of over 1,300 exercises with photos.',
      'See your history, personal records, and progress charts.',
      'Light and dark theme.',
      'Works offline — everything stays on your phone.',
    ],
    es: [
      'Sigue tus entrenamientos y registra series durante una sesión.',
      'Explora un catálogo de más de 1300 ejercicios con fotos.',
      'Consulta tu historial, récords personales y gráficos de progreso.',
      'Tema claro y oscuro.',
      'Funciona sin conexión — todo se queda en tu teléfono.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-04',
    en: ['Added a "PR only" filter to quickly find exercises where you’ve set a personal record.'],
    es: ['Se añadió un filtro "Solo récords" para encontrar rápido los ejercicios en los que tienes un récord personal.'],
  },
  {
    version: '1.2.0',
    date: '2026-08-06',
    en: ['Added favorite exercises — star your go-to exercises and filter down to just those.'],
    es: ['Se añadieron los ejercicios favoritos — marca con una estrella tus preferidos y fíltralos.'],
  },
  {
    version: '1.3.0',
    date: '2026-08-06',
    en: [
      'Training days can now be archived instead of deleted, so you can set one aside without losing its history.',
      'A training day with no history can be deleted outright.',
    ],
    es: [
      'Ahora puedes archivar un entrenamiento en lugar de eliminarlo, para dejarlo de lado sin perder su historial.',
      'Un entrenamiento sin historial se puede eliminar directamente.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-07',
    en: ['Home now shows a lifetime summary at the bottom: total sessions and total weight lifted.'],
    es: ['Inicio ahora muestra un resumen de por vida al final de la página: total de sesiones y peso total levantado.'],
  },
  {
    version: '1.5.0',
    date: '2026-08-07',
    en: ['Today’s training card now shows how long that workout usually takes you.'],
    es: ['La tarjeta del entrenamiento de hoy ahora muestra cuánto suele durar esa sesión.'],
  },
  {
    version: '1.6.0',
    date: '2026-08-08',
    en: ['Added a language setting — switch the app between English and Spanish from Settings.'],
    es: ['Se añadió un ajuste de idioma — cambia la app entre inglés y español desde Ajustes.'],
  },
  {
    version: '1.7.0',
    date: '2026-08-08',
    en: [
      'Added a "What’s new" popup that shows what changed after an update.',
      'Added a full changelog, reachable from Settings.',
    ],
    es: [
      'Se añadió un aviso de "Novedades" que muestra qué cambió tras una actualización.',
      'Se añadió un historial de cambios completo, accesible desde Ajustes.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-08',
    en: [
      'Added a profile — name, birthdate and height, tap the greeting on Home to open it.',
      'Log your weight over time, with an optional photo per check-in, and see the trend on a chart.',
      'BMI shows automatically once you’ve added a height and at least one check-in.',
    ],
    es: [
      'Se añadió un perfil — nombre, fecha de nacimiento y altura; toca el saludo en Inicio para abrirlo.',
      'Registra tu peso a lo largo del tiempo, con una foto opcional por registro, y consulta la tendencia en un gráfico.',
      'El IMC se muestra automáticamente en cuanto añades una altura y al menos un registro.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-08-08',
    en: ['The Home greeting is now clearly a link to your profile — bigger, blue, underlined.'],
    es: ['El saludo de Inicio ahora se ve claramente como un enlace a tu perfil — más grande, azul y subrayado.'],
  },
  {
    version: '1.9.0',
    date: '2026-08-08',
    en: [
      'Reorder the exercises within a training day by dragging the grip on each card — the new order also applies to your next session.',
    ],
    es: [
      'Reordena los ejercicios de un entrenamiento arrastrando la manija de cada tarjeta — el nuevo orden también se aplica a tu próxima sesión.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-08-09',
    en: [
      'The exercise catalogue — name, category, equipment and target muscle — is now translated when Spanish is selected.',
    ],
    es: [
      'El catálogo de ejercicios — nombre, categoría, equipo y músculo objetivo — ahora se traduce cuando seleccionas español.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-08-09',
    en: [
      'Added other sports — Snowboard, Cycling and Climbing training days log a quick summary (weather/snow, distance/elevation/heart rate, or climbs per grade) instead of exercises and sets.',
      'Sport sessions show up on Home’s calendar and in History alongside your gym sessions, but never count toward your weekly goal or streak.',
    ],
    es: [
      'Se añadieron otros deportes — los entrenamientos de Snowboard, Ciclismo y Escalada registran un resumen rápido (tiempo/nieve, distancia/desnivel/pulsaciones, o vías por grado) en lugar de ejercicios y series.',
      'Las sesiones de deporte aparecen en el calendario de Inicio y en Historial junto a tus sesiones de gimnasio, pero nunca cuentan para tu objetivo semanal ni tu racha.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-08-09',
    en: ['Fixed the oversized "Add training day" card crowding the new "Other activities" section.'],
    es: ['Se corrigió la tarjeta "Añadir entrenamiento", que era demasiado grande y quedaba pegada a la nueva sección "Otras actividades".'],
  },
];

/** Keep in sync with the bootstrap-independent nature of theme/language: this
 *  is a device-local preference, not app data, so it lives in localStorage. */
export const LAST_SEEN_VERSION_KEY = 'ander-gym-last-seen-version';

export function getLastSeenVersion(): string | null {
  return localStorage.getItem(LAST_SEEN_VERSION_KEY);
}

export function setLastSeenVersion(version: string): void {
  localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
}

/** Numeric per-segment compare, so "1.10.0" sorts after "1.9.0". */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Entries newer than `lastSeen`, oldest first.
 *
 * `lastSeen === null` means nothing has been recorded yet — either a brand
 * new install, or an existing install seeing this feature for the first
 * time. Either way, showing the entire history back to 1.0.0 would be a wall
 * of popups nobody asked for, so only the latest entry is shown; the full
 * history stays one tap away in the Settings changelog.
 */
export function unseenEntries(lastSeen: string | null): ChangelogEntry[] {
  if (lastSeen === null) return CHANGELOG.slice(-1);
  return CHANGELOG.filter((entry) => compareVersions(entry.version, lastSeen) > 0);
}
