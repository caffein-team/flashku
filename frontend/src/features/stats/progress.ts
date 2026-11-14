import { useQuery } from '@tanstack/react-query';

import { usersApi, type Progress } from '@/api/users';

export const progressKey = ['progress'] as const;

export function useProgress() {
  return useQuery({ queryKey: progressKey, queryFn: usersApi.progress });
}

/** Bentuk `Progress` dari respons POST /study/review, supaya Beranda ikut berubah tanpa mengambil ulang. */
export function progressFromReview(r: {
  user_level: number;
  user_xp?: number;
  xp_required?: number;
  xp_progress_percentage?: number;
}): Progress | undefined {
  if (r.user_xp === undefined || r.xp_required === undefined) return undefined;
  return { level: r.user_level, xp: r.user_xp, xpRequired: r.xp_required, percent: r.xp_progress_percentage ?? 0 };
}
