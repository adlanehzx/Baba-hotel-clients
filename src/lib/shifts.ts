/**
 * Horaires des services du planning et « qui est en service maintenant ».
 * Ce fichier est recopié tel quel dans Baba-hotel-clients (src/lib/shifts.ts) :
 * les deux applications doivent calculer la même chose.
 */
// Semaine : 3 services (matin, soir, nuit). Week-end : 2 services de 12 h (journée, nuit 12 h).
export const SHIFT_HOURS: Record<string, [number, number]> = {
  matin: [7, 16],
  soir: [16, 23],
  nuit: [23, 7], // jusqu'au lendemain 7 h
  journee: [7, 19],
  nuit12: [19, 7], // nuit de 12 h (week-end), jusqu'au lendemain 7 h
};

export type DutyShift = { day: string; staff: string; shift: string };

/** Date et heure de Paris d'un instant. */
export function parisNow(ms: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) + Number(p.minute) / 60 };
}

const prevDay = (day: string) => new Date(Date.parse(day + 'T12:00:00Z') - 86_400_000).toISOString().slice(0, 10);

/**
 * Personnes en service à cet instant (absents exclus en amont, remplaçants inclus).
 * null : personne n'est prévu à cette heure → tout le monde est prévenu, pour ne jamais rater un client.
 */
export function onDutyNow(shifts: DutyShift[], ms: number): string[] | null {
  const { day, hour } = parisNow(ms);
  const yesterday = prevDay(day);
  const on = new Set<string>();
  for (const s of shifts) {
    const h = SHIFT_HOURS[s.shift];
    if (!h) continue;
    const [start, end] = h;
    if (start < end) {
      if (s.day === day && hour >= start && hour < end) on.add(s.staff);
    } else {
      // Service de nuit : le soir même, ou le lendemain matin.
      if ((s.day === day && hour >= start) || (s.day === yesterday && hour < end)) on.add(s.staff);
    }
  }
  return on.size ? [...on] : null;
}
