import { ADDIS_LOCATIONS, SUBJECTS } from '../data/catalog';
import type { AdminTutorItem } from '../types/app';

export interface OwnerParentSearchCriteria {
  parentName: string;
  parentPhone: string;
  location: string; // 'any' or Addis location id
  mode: 'any' | 'in_person' | 'online';
  sexPreference: 'any' | 'female' | 'male';
  feeBudget: 'any' | '400_600' | '600_plus';
  kidsCount: number;
  gradeLevels: string[]; // KID_GRADE_LEVELS ids
  subjects: string[]; // SUBJECTS ids
  selectedDays: string[]; // DAYS_OF_WEEK ids
  minDaysPerWeek: number; // 0 = any
  hoursPerDay: 'any' | '1' | '2' | '3';
  weekdaySlots: string[];
  weekendSlots: string[];
  verifiedOnly: boolean;
  excludeMatched: boolean;
}

export interface CriterionCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface RankedTutorMatch {
  tutor: AdminTutorItem;
  score: number;
  tier: 'perfect' | 'strong' | 'partial';
  hardMismatchReasons: string[];
  checks: CriterionCheck[];
  matchedSubjects: string[];
  missingSubjects: string[];
  matchedDays: string[];
  matchedSlots: string[];
}

function eduFitsGrades(edu: string, grades: string[]): { ok: boolean; detail: string } {
  if (grades.length === 0) return { ok: true, detail: 'All grade levels' };
  const needsSeniorHigh = grades.includes('grade_11_12');
  if (needsSeniorHigh && (edu === 'grade_11' || edu === 'grade_12')) {
    return {
      ok: false,
      detail: 'High school tutor may be under-qualified for Grade 11–12 student(s)',
    };
  }
  return { ok: true, detail: `Qualified for ${grades.length} selected grade tier(s)` };
}

function feeMatchesBudget(tutorFee: string, budget: OwnerParentSearchCriteria['feeBudget']): boolean {
  if (budget === 'any') return true;
  if (budget === '400_600') {
    return tutorFee === '400_600' || tutorFee === '400' || tutorFee === '500' || tutorFee === '600';
  }
  if (budget === '600_plus') {
    return true; // 600+ budget accepts both 400-600 and 600+ tutors
  }
  return true;
}

export function rankTutorsForParentCriteria(
  tutors: AdminTutorItem[],
  confirmedTutorIds: Set<string>,
  criteria: OwnerParentSearchCriteria
): RankedTutorMatch[] {
  const locMap = new Map(ADDIS_LOCATIONS.map((l) => [l.id, l.en]));
  const subjMap = new Map(SUBJECTS.map((s) => [s.id, s.en]));

  const eligiblePool = tutors.filter((t) => {
    if (t.status === 'blocked' || t.status === 'rejected' || t.status === 'draft') return false;
    if (criteria.verifiedOnly && t.status !== 'verified') return false;
    if (criteria.excludeMatched && confirmedTutorIds.has(t.id)) return false;
    return true;
  });

  const ranked: RankedTutorMatch[] = eligiblePool.map((tutor) => {
    const hardMismatchReasons: string[] = [];
    const checks: CriterionCheck[] = [];

    // 1. Mode & Location (25 pts)
    let modeOk = true;
    if (criteria.mode === 'online') {
      modeOk = tutor.profile.tutoringMode === 'online' || tutor.profile.tutoringMode === 'both';
    } else if (criteria.mode === 'in_person') {
      modeOk = tutor.profile.tutoringMode === 'in_person' || tutor.profile.tutoringMode === 'both';
    }
    if (!modeOk) {
      hardMismatchReasons.push(`Mode mismatch (${tutor.profile.tutoringMode})`);
    }

    let locOk = true;
    let locDetail = 'Any location';
    if (criteria.mode === 'online') {
      locOk = modeOk;
      locDetail = modeOk ? 'Online supported' : 'In-person only';
    } else if (criteria.location !== 'any') {
      locOk = tutor.profile.preferredLocations.includes(criteria.location);
      const areaName = locMap.get(criteria.location) || criteria.location;
      locDetail = locOk ? `Covers ${areaName}` : `Does not list ${areaName}`;
      if (!locOk && criteria.mode === 'in_person') {
        hardMismatchReasons.push(`Not in ${areaName}`);
      }
    } else {
      locDetail = `${tutor.profile.preferredLocations.length} Addis areas`;
    }

    const locationPoints = modeOk && locOk ? 25 : locOk ? 10 : modeOk && criteria.location === 'any' ? 25 : 0;
    checks.push({
      label: 'Location & Mode',
      ok: modeOk && locOk,
      detail: locDetail,
    });

    // 2. Subjects Needed (30 pts)
    const reqSubjects = criteria.subjects;
    const matchedSubjects = reqSubjects.filter((s) =>
      tutor.profile.preferredSubjects.includes(s)
    );
    const missingSubjects = reqSubjects.filter(
      (s) => !tutor.profile.preferredSubjects.includes(s)
    );
    const subjRatio = reqSubjects.length > 0 ? matchedSubjects.length / reqSubjects.length : 1;
    const subjectPoints = Math.round(subjRatio * 30);
    if (reqSubjects.length > 0 && matchedSubjects.length === 0) {
      hardMismatchReasons.push('No requested subjects matched');
    }
    checks.push({
      label: 'Subjects',
      ok: reqSubjects.length === 0 || matchedSubjects.length === reqSubjects.length,
      detail:
        reqSubjects.length === 0
          ? `${tutor.profile.preferredSubjects.length} subjects offered`
          : missingSubjects.length === 0
          ? `All ${matchedSubjects.length}/${reqSubjects.length} subjects match`
          : `${matchedSubjects.length}/${reqSubjects.length} match (missing: ${missingSubjects
              .map((id) => subjMap.get(id) || id)
              .join(', ')})`,
    });

    // 3. Schedule: Days per week, Time Slots, Hours per day (20 pts)
    const reqDays = criteria.selectedDays;
    const matchedDays = reqDays.filter((d) => tutor.profile.preferredDays.includes(d));
    const meetsDayCount =
      criteria.minDaysPerWeek === 0 ||
      tutor.profile.preferredDays.length >= criteria.minDaysPerWeek;

    let dayScore = 10;
    if (reqDays.length > 0) {
      dayScore = Math.round((matchedDays.length / reqDays.length) * 10);
      if (matchedDays.length === 0) hardMismatchReasons.push('None of the requested days match');
    } else if (!meetsDayCount) {
      dayScore = Math.round(
        (tutor.profile.preferredDays.length / criteria.minDaysPerWeek) * 10
      );
      hardMismatchReasons.push(`Available ${tutor.profile.preferredDays.length} days/wk (< ${criteria.minDaysPerWeek})`);
    }

    const reqSlots = [...criteria.weekdaySlots, ...criteria.weekendSlots];
    const tutorSlots = [...tutor.profile.weekdaySlots, ...tutor.profile.weekendSlots];
    const matchedSlots = reqSlots.filter((s) => tutorSlots.includes(s));
    const slotScore =
      reqSlots.length > 0 ? Math.round((matchedSlots.length / reqSlots.length) * 6) : 6;

    const neededHoursNum = criteria.hoursPerDay === 'any' ? 0 : Number(criteria.hoursPerDay);
    const tutorHoursCapacity = Math.max(
      tutor.profile.weekdaySlots.length,
      tutor.profile.weekendSlots.length
    );
    const hoursOk = neededHoursNum === 0 || tutorHoursCapacity >= neededHoursNum;
    const hoursScore = hoursOk ? 4 : 1;

    const daysOk =
      (reqDays.length === 0 || matchedDays.length === reqDays.length) && meetsDayCount;
    const slotsOk = reqSlots.length === 0 || matchedSlots.length === reqSlots.length;

    checks.push({
      label: 'Days & Hours',
      ok: daysOk && slotsOk && hoursOk,
      detail: `${
        reqDays.length > 0
          ? `${matchedDays.length}/${reqDays.length} days`
          : `${tutor.profile.preferredDays.length} days/wk`
      }${
        neededHoursNum > 0
          ? ` · ${hoursOk ? `Fits ${neededHoursNum} hr/day` : `Limited slots for ${neededHoursNum} hr/day`}`
          : ''
      }${reqSlots.length > 0 ? ` · ${matchedSlots.length}/${reqSlots.length} time slots` : ''}`,
    });

    // 4. Fee / Budget Alignment (15 pts)
    const feeOk = feeMatchesBudget(tutor.profile.expectedFeePerHour, criteria.feeBudget);
    const feePoints = feeOk ? 15 : 4;
    if (!feeOk) {
      hardMismatchReasons.push('Tutor fee (600+) exceeds 400–600 budget');
    }
    checks.push({
      label: 'Hourly Fee',
      ok: feeOk,
      detail: feeOk
        ? `Fee (${tutor.profile.expectedFeePerHour === '600_plus' ? '600+ ETB' : '400–600 ETB'}) fits`
        : 'Tutor expects 600+ ETB/hr (above 400–600 budget)',
    });

    // 5. Sex, Student Grade & Count Suitability, Verification (10 pts)
    const sexOk =
      criteria.sexPreference === 'any' || tutor.profile.sex === criteria.sexPreference;
    if (!sexOk) {
      hardMismatchReasons.push(`Sex mismatch (${tutor.profile.sex})`);
    }
    const sexPoints = sexOk ? 4 : 0;

    const gradeFit = eduFitsGrades(tutor.profile.educationLevel, criteria.gradeLevels);
    const gradePoints = gradeFit.ok ? 3 : 0;
    if (!gradeFit.ok) hardMismatchReasons.push(gradeFit.detail);

    const statusBonus = tutor.status === 'verified' ? 3 : 1;

    checks.push({
      label: 'Sex & Grade Fit',
      ok: sexOk && gradeFit.ok,
      detail: `${tutor.profile.sex === 'female' ? 'Female' : 'Male'} · ${gradeFit.detail}${
        criteria.kidsCount > 1 ? ` · ${criteria.kidsCount} students` : ''
      }`,
    });

    const rawScore =
      locationPoints +
      subjectPoints +
      dayScore +
      slotScore +
      hoursScore +
      feePoints +
      sexPoints +
      gradePoints +
      statusBonus;

    // Penalize hard mismatch so non-exact candidates never rank above exact matches
    const score = Math.max(
      0,
      Math.min(100, hardMismatchReasons.length > 0 ? Math.min(rawScore, 69) : rawScore)
    );

    const tier: RankedTutorMatch['tier'] =
      score >= 90 && hardMismatchReasons.length === 0
        ? 'perfect'
        : score >= 75 && hardMismatchReasons.length === 0
        ? 'strong'
        : 'partial';

    return {
      tutor,
      score,
      tier,
      hardMismatchReasons,
      checks,
      matchedSubjects,
      missingSubjects,
      matchedDays,
      matchedSlots,
    };
  });

  // Sort: exact matches (zero hard mismatches) first, then highest score, then verified first
  return ranked.sort((a, b) => {
    const aHard = a.hardMismatchReasons.length === 0 ? 0 : 1;
    const bHard = b.hardMismatchReasons.length === 0 ? 0 : 1;
    if (aHard !== bHard) return aHard - bHard;
    if (b.score !== a.score) return b.score - a.score;
    const aVer = a.tutor.status === 'verified' ? 1 : 0;
    const bVer = b.tutor.status === 'verified' ? 1 : 0;
    return bVer - aVer;
  });
}
