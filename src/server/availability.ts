import type { HorarioTrabalho, SlotDisponivel } from '../shared/types.ts';

export interface ExistingInterval {
  id?: number;
  inicio: string; // YYYY-MM-DDTHH:MM
  fim: string; // YYYY-MM-DDTHH:MM
}

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Horário inválido: ${hhmm}`);
  }
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function extractTimeFromIso(isoLocal: string): string {
  // Expected format: YYYY-MM-DDTHH:MM
  return isoLocal.slice(11, 16);
}

export function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayOfWeekFromYYYYMMDD(dateStr: string): number {
  // Parse midday local to avoid DST / UTC midnight shifts
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getDay();
}

/**
 * Rule from specification:
 * Conflict occurs when newStart < existingEnd AND newEnd > existingStart
 */
export function hasIntervalOverlap(
  candStartMin: number,
  candEndMin: number,
  existingStartMin: number,
  existingEndMin: number
): boolean {
  return candStartMin < existingEndMin && candEndMin > existingStartMin;
}

/**
 * Pure dynamic availability calculator (5-step algorithm):
 * 1. Take work windows for professional on dia_semana (supports lunch breaks via multiple rows)
 * 2. Take confirmed appointments on that day
 * 3. Step through each work window by passoMin (15 or 30 min)
 * 4. Discard candidate if [start, start + duracaoMin] overlaps any confirmed appointment or exceeds window end
 * 5. Return remaining available slots
 */
export function computeAvailableSlots(params: {
  data: string; // YYYY-MM-DD
  duracaoMin: number;
  passoMin: number;
  faixasTrabalho: Pick<HorarioTrabalho, 'hora_inicio' | 'hora_fim'>[];
  agendamentosConfirmados: ExistingInterval[];
  minStartIso?: string; // optional YYYY-MM-DDTHH:MM cutoff for past slots on current day
}): SlotDisponivel[] {
  const { data, duracaoMin, passoMin, faixasTrabalho, agendamentosConfirmados, minStartIso } = params;

  if (duracaoMin <= 0 || passoMin <= 0 || faixasTrabalho.length === 0) {
    return [];
  }

  const busyIntervals = agendamentosConfirmados.map((item) => ({
    start: timeToMinutes(extractTimeFromIso(item.inicio)),
    end: timeToMinutes(extractTimeFromIso(item.fim)),
  }));

  let minTodayMinutes: number | null = null;
  if (minStartIso && minStartIso.startsWith(data)) {
    minTodayMinutes = timeToMinutes(extractTimeFromIso(minStartIso));
  } else if (minStartIso && data < minStartIso.slice(0, 10)) {
    // Past day has no open slots
    return [];
  }

  const slots: SlotDisponivel[] = [];
  const seenStartTimes = new Set<number>();

  const sortedFaixas = [...faixasTrabalho].sort((a, b) =>
    a.hora_inicio.localeCompare(b.hora_inicio)
  );

  for (const faixa of sortedFaixas) {
    const winStart = timeToMinutes(faixa.hora_inicio);
    const winEnd = timeToMinutes(faixa.hora_fim);

    for (let candStart = winStart; candStart + duracaoMin <= winEnd; candStart += passoMin) {
      if (seenStartTimes.has(candStart)) continue;

      if (minTodayMinutes !== null && candStart <= minTodayMinutes) {
        continue;
      }

      const candEnd = candStart + duracaoMin;
      const overlaps = busyIntervals.some((busy) =>
        hasIntervalOverlap(candStart, candEnd, busy.start, busy.end)
      );

      if (!overlaps) {
        seenStartTimes.add(candStart);
        const horaInicio = minutesToTime(candStart);
        const horaFim = minutesToTime(candEnd);
        slots.push({
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          inicio_iso: `${data}T${horaInicio}`,
          fim_iso: `${data}T${horaFim}`,
        });
      }
    }
  }

  return slots.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
}

export function isWithinWorkWindows(
  startHHMM: string,
  endHHMM: string,
  faixasTrabalho: Pick<HorarioTrabalho, 'hora_inicio' | 'hora_fim'>[]
): boolean {
  const startMin = timeToMinutes(startHHMM);
  const endMin = timeToMinutes(endHHMM);
  if (endMin <= startMin) return false;

  return faixasTrabalho.some((faixa) => {
    const wStart = timeToMinutes(faixa.hora_inicio);
    const wEnd = timeToMinutes(faixa.hora_fim);
    return startMin >= wStart && endMin <= wEnd;
  });
}
