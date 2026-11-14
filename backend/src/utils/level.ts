/**
 * Level & EXP System for Flashku
 *
 * Rules:
 * - Each card review completed grants 10 XP.
 *
 * Level Formula:
 * - Level 1 -> Level 2: 100 XP (10 card reviews)
 * - Level 2 -> Level 3: 200 XP (20 card reviews)
 * - Level 3 -> Level 4: 300 XP (30 card reviews)
 * - Level L -> Level L+1: 100 * L XP
 *
 * Cumulative Total XP to reach Level L:
 * - Level 1: 0 XP
 * - Level 2: 100 XP
 * - Level 3: 300 XP (100 + 200)
 * - Level 4: 600 XP (100 + 200 + 300)
 * - Level 5: 1000 XP
 * - Level L: 50 * L * (L - 1)
 */

export interface UserLevelProgress {
    level: number;
    xp: number;                     // Current XP within the current level
    xp_required: number;            // XP required to finish current level and level up
    total_xp: number;               // Cumulative all-time XP earned
    xp_progress_percentage: number; // 0 to 100%
    leveled_up: boolean;            // Whether this review triggered a level-up
    levels_gained: number;          // How many levels gained
}

/**
 * Calculates the XP required to complete the given level and advance to the next level.
 * Formula: 100 * Level (Level 1: 100 XP, Level 2: 200 XP, Level 3: 300 XP, etc.)
 */
export function getXpRequiredForLevel(level: number): number {
    return 100 * Math.max(1, Math.floor(level));
}

/**
 * Calculates the updated level, current level XP, total XP, and whether level-up occurred.
 * Supports rollover of surplus XP to subsequent levels.
 */
export function calculateNewLevel(
    currentLevel: number = 1,
    currentXp: number = 0,
    currentTotalXp: number = 0,
    gainedXp: number = 10
): UserLevelProgress {
    let level = Math.max(1, currentLevel || 1);
    let xp = Math.max(0, currentXp || 0) + gainedXp;
    let totalXp = Math.max(0, currentTotalXp || 0) + gainedXp;
    let levelsGained = 0;

    let req = getXpRequiredForLevel(level);
    while (xp >= req) {
        xp -= req;
        level++;
        levelsGained++;
        req = getXpRequiredForLevel(level);
    }

    const percentage = Math.min(100, Math.floor((xp / req) * 100));

    return {
        level,
        xp,
        xp_required: req,
        total_xp: totalXp,
        xp_progress_percentage: percentage,
        leveled_up: levelsGained > 0,
        levels_gained: levelsGained
    };
}
