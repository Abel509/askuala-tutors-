import { ADDIS_LOCATIONS, EDUCATION_LEVEL_LABELS, KID_GRADE_LEVELS, SUBJECTS } from '../data/catalog';
import type { AdminParentItem, AdminTutorItem } from '../types/app';

export type RequiredTutorEducation =
  | 'any'
  | 'grade_11_plus'
  | 'grade_12_plus'
  | 'college_plus'
  | 'bachelors_plus'
  | 'certified_teacher';

export interface OwnerParentSearchCriteria {
  parentName: string;
  parentPhone: string;
  requiredEducationLevel: RequiredTutorEducation;
  schoolCurriculum: 'any' | 'standard' | 'international';
  minExperience: 'any' | '1_year_plus' | '2_plus_years';
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

export interface OwnerTutorInquiryCriteria {
  tutorName: string;
  tutorPhone: string;
  educationLevel: 'grade_11' | 'grade_12' | 'college' | 'bachelors' | 'certified_teacher';
  sex: 'female' | 'male';
  mode: 'both' | 'in_person' | 'online';
  expectedFeePerHour: '400_600' | '600_plus';
  priorExperience: 'first_time' | '1_year' | '2_plus_years';
  preferredLocations: string[];
  subjects: string[];
  daysPerWeek: number; // 0 = any
  selectedDays: string[];
  hoursPerDay: 'any' | '1' | '2' | '3';
  weekdaySlots: string[];
  weekendSlots: string[];
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

export interface RankedParentMatch {
  parent: AdminParentItem;
  score: number;
  tier: 'perfect' | 'strong' | 'partial';
  hardMismatchReasons: string[];
  checks: CriterionCheck[];
  matchedSubjects: string[];
  missingSubjects: string[];
  matchedDays: string[];
  matchedSlots: string[];
}

const EDU_RANK: Record<string, number> = {
  below_11: 0,
  grade_11: 1,
  grade_12: 2,
  college: 3,
  bachelors: 4,
  certified_teacher: 5,
};

function tutorMeetsEducationReq(
  tutorEdu: string,
  req: RequiredTutorEducation
): { ok: boolean; detail: string } {
  const label = EDUCATION_LEVEL_LABELS[tutorEdu] || tutorEdu;
  if (req === 'any') return { ok: true, detail: label };
  const rank = EDU_RANK[tutorEdu] ?? 0;
  if (req === 'grade_11_plus') {
    return { ok: rank >= 1, detail: label };
  }
  if (req === 'grade_12_plus') {
    return { ok: rank >= 2, detail: rank >= 2 ? label : `${label} (Needs Grade 12+)` };
  }
  if (req === 'college_plus') {
    return { ok: rank >= 3, detail: rank >= 3 ? label : `${label} (Needs College+)` };
  }
  if (req === 'bachelors_plus') {
    return { ok: rank >= 4, detail: rank >= 4 ? label : `${label} (Needs Bachelor's+)` };
  }
  if (req === 'certified_teacher') {
    return { ok: rank >= 5, detail: rank >= 5 ? label : `${label} (Needs Certified Teacher)` };
  }
  return { ok: true, detail: label };
}

function eduFitsGrades(edu: string, grades: string[]): { ok: boolean; detail: string } {
  if (grades.length === 0) return { ok: true, detail: 'All grade levels' };
  const needsSeniorHigh = grades.includes('grade_11') || grades.includes('grade_12');
  const needsGrade12Only = grades.includes('grade_12');
  if (edu === 'grade_11' && (grades.includes('grade_11') || grades.includes('grade_12'))) {
    return {
      ok: false,
      detail: 'Grade 11 tutor cannot teach Grade 11–12 student(s)',
    };
  }
  if (edu === 'grade_12' && needsGrade12Only) {
    return {
      ok: false,
      detail: 'Grade 12 tutor should be matched to ≤ Grade 11 students',
    };
  }
  if (needsSeniorHigh && (edu === 'below_11')) {
    return {
      ok: false,
      detail: 'Under-qualified for senior high grades',
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

function tutorFeeFitsParentAppBudget(tutorFee: string, parentBudget: string): boolean {
  if (tutorFee === '400_600') {
    return parentBudget === '400_500' || parentBudget === 'max_600' || parentBudget === '600_700_efficiency';
  }
  if (tutorFee === '600_plus') {
    return parentBudget === '600_700_efficiency';
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
    if (!t.submittedAt) return false;
    if (criteria.verifiedOnly && t.status !== 'verified') return false;
    if (criteria.excludeMatched && confirmedTutorIds.has(t.id)) return false;
    return true;
  });

  const ranked: RankedTutorMatch[] = eligiblePool.map((tutor) => {
    const hardMismatchReasons: string[] = [];
    const checks: CriterionCheck[] = [];

    // 1. Mode & Location (22 pts)
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

    const locationPoints =
      modeOk && locOk ? 22 : locOk ? 9 : modeOk && criteria.location === 'any' ? 22 : 0;
    checks.push({
      label: 'Location & Mode',
      ok: modeOk && locOk,
      detail: locDetail,
    });

    // 2. Subjects Needed (28 pts)
    const reqSubjects = criteria.subjects;
    const matchedSubjects = reqSubjects.filter((s) =>
      tutor.profile.preferredSubjects.includes(s)
    );
    const missingSubjects = reqSubjects.filter(
      (s) => !tutor.profile.preferredSubjects.includes(s)
    );
    const subjRatio = reqSubjects.length > 0 ? matchedSubjects.length / reqSubjects.length : 1;
    const subjectPoints = Math.round(subjRatio * 28);
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

    // 3. Tutor Education Level + Student Grade Fit (12 pts)
    const eduCheck = tutorMeetsEducationReq(
      tutor.profile.educationLevel,
      criteria.requiredEducationLevel || 'any'
    );
    const gradeFit = eduFitsGrades(tutor.profile.educationLevel, criteria.gradeLevels);
    const eduPoints = eduCheck.ok && gradeFit.ok ? 12 : eduCheck.ok || gradeFit.ok ? 4 : 0;
    if (!eduCheck.ok) hardMismatchReasons.push(eduCheck.detail);
    if (!gradeFit.ok) hardMismatchReasons.push(gradeFit.detail);

    checks.push({
      label: 'Education & Grades',
      ok: eduCheck.ok && gradeFit.ok,
      detail: `${eduCheck.detail}${
        criteria.gradeLevels.length > 0 ? ` · ${gradeFit.detail}` : ''
      }${criteria.kidsCount > 1 ? ` · ${criteria.kidsCount} kids` : ''}`,
    });

    // 4. Schedule: Days per week, Time Slots, Hours per day (18 pts)
    const reqDays = criteria.selectedDays;
    const matchedDays = reqDays.filter((d) => tutor.profile.preferredDays.includes(d));
    const tutorDaysCap = tutor.profile.daysPerWeek || tutor.profile.preferredDays.length;
    const meetsDayCount =
      criteria.minDaysPerWeek === 0 ||
      tutor.profile.preferredDays.length >= criteria.minDaysPerWeek ||
      tutorDaysCap >= criteria.minDaysPerWeek;

    let dayScore = 9;
    if (reqDays.length > 0) {
      dayScore = Math.round((matchedDays.length / reqDays.length) * 9);
      if (matchedDays.length === 0) hardMismatchReasons.push('None of the requested days match');
    } else if (!meetsDayCount) {
      dayScore = Math.round((tutor.profile.preferredDays.length / criteria.minDaysPerWeek) * 9);
      hardMismatchReasons.push(
        `Available ${tutor.profile.preferredDays.length} days/wk (< ${criteria.minDaysPerWeek})`
      );
    }

    const reqSlots = [...criteria.weekdaySlots, ...criteria.weekendSlots];
    const tutorSlots = [...tutor.profile.weekdaySlots, ...tutor.profile.weekendSlots];
    const matchedSlots = reqSlots.filter((s) => tutorSlots.includes(s));
    const slotScore =
      reqSlots.length > 0 ? Math.round((matchedSlots.length / reqSlots.length) * 5) : 5;

    const neededHoursNum = criteria.hoursPerDay === 'any' ? 0 : Number(criteria.hoursPerDay);
    const tutorHoursCapacity = Math.max(
      Number(tutor.profile.hoursPerDay || 0),
      tutor.profile.weekdaySlots.length,
      tutor.profile.weekendSlots.length
    );
    const hoursOk = neededHoursNum === 0 || tutorHoursCapacity >= neededHoursNum;
    const hoursScore = hoursOk ? 4 : 1;

    const daysOk =
      (reqDays.length === 0 || matchedDays.length === reqDays.length) && meetsDayCount;
    const slotsOk = reqSlots.length === 0 || matchedSlots.length === reqSlots.length;

    checks.push({
      label: 'Days & Schedule',
      ok: daysOk && slotsOk && hoursOk,
      detail: `${
        reqDays.length > 0
          ? `${matchedDays.length}/${reqDays.length} days`
          : `${tutor.profile.preferredDays.length} days/wk`
      }${
        neededHoursNum > 0
          ? ` · ${hoursOk ? `Fits ${neededHoursNum} hr/day` : `Limited slots for ${neededHoursNum} hr/day`}`
          : ''
      }${reqSlots.length > 0 ? ` · ${matchedSlots.length}/${reqSlots.length} slots` : ''}`,
    });

    // 5. Fee / Budget Alignment (12 pts)
    const feeOk = feeMatchesBudget(tutor.profile.expectedFeePerHour, criteria.feeBudget);
    const feePoints = feeOk ? 12 : 3;
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

    // 6. Sex, Experience & Verification (8 pts)
    const sexOk =
      criteria.sexPreference === 'any' || tutor.profile.sex === criteria.sexPreference;
    if (!sexOk) {
      hardMismatchReasons.push(`Sex mismatch (${tutor.profile.sex})`);
    }
    const sexPoints = sexOk ? 4 : 0;

    const expOk =
      criteria.minExperience === 'any' ||
      (criteria.minExperience === '1_year_plus' &&
        (tutor.profile.priorExperience === '1_year' ||
          tutor.profile.priorExperience === '2_plus_years')) ||
      (criteria.minExperience === '2_plus_years' &&
        tutor.profile.priorExperience === '2_plus_years');
    const expPoints = expOk ? 2 : 0;
    if (!expOk) {
      hardMismatchReasons.push('Experience below requested level');
    }

    const statusBonus = tutor.status === 'verified' ? 2 : 1;

    checks.push({
      label: 'Sex & Experience',
      ok: sexOk && expOk,
      detail: `${tutor.profile.sex === 'female' ? 'Female' : 'Male'} · ${
        tutor.profile.priorExperience === '2_plus_years'
          ? '2+ yrs'
          : tutor.profile.priorExperience === '1_year'
          ? '1 yr'
          : 'First-time'
      }`,
    });

    const rawScore =
      locationPoints +
      subjectPoints +
      eduPoints +
      dayScore +
      slotScore +
      hoursScore +
      feePoints +
      sexPoints +
      expPoints +
      statusBonus;

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

export function rankParentsForTutorCriteria(
  parents: AdminParentItem[],
  confirmedParentIds: Set<string>,
  criteria: OwnerTutorInquiryCriteria
): RankedParentMatch[] {
  const locMap = new Map(ADDIS_LOCATIONS.map((l) => [l.id, l.en]));
  const gradeMap = new Map(KID_GRADE_LEVELS.map((g) => [g.id, g.en]));
  const subjMap = new Map(SUBJECTS.map((s) => [s.id, s.en]));

  const eligibleParents = parents.filter((p) => {
    if (p.status === 'draft') return false;
    if (criteria.excludeMatched && (p.status === 'matched' || confirmedParentIds.has(p.id))) {
      return false;
    }
    return true;
  });

  const ranked: RankedParentMatch[] = eligibleParents.map((parent) => {
    const hardMismatchReasons: string[] = [];
    const checks: CriterionCheck[] = [];

    const parentMode = parent.tutorPreference.mode || 'in_person';
    const parentLoc = parent.parentProfile.location;
    const parentLocName = locMap.get(parentLoc) || parentLoc;

    // 1. Mode & Location (25 pts)
    const modeOk = criteria.mode === 'both' || criteria.mode === parentMode;
    if (!modeOk) {
      hardMismatchReasons.push(`Family wants ${parentMode === 'online' ? 'Online' : 'In-Person'}`);
    }
    const locOk =
      parentMode === 'online' ||
      criteria.preferredLocations.length === 0 ||
      criteria.preferredLocations.includes(parentLoc);
    if (!locOk && parentMode === 'in_person') {
      hardMismatchReasons.push(`Family is in ${parentLocName}`);
    }
    const locPoints = modeOk && locOk ? 25 : locOk ? 10 : modeOk ? 12 : 0;
    checks.push({
      label: 'Location & Mode',
      ok: modeOk && locOk,
      detail: `${parentLocName} (${parentMode === 'online' ? 'Online' : 'In-Person'})`,
    });

    // 2. Subjects Alignment (30 pts)
    const familySubjects = Array.from(new Set(parent.kids.flatMap((k) => k.preferredSubjects)));
    const matchedSubjects =
      criteria.subjects.length === 0
        ? familySubjects
        : familySubjects.filter((s) => criteria.subjects.includes(s));
    const missingSubjects =
      criteria.subjects.length === 0
        ? []
        : familySubjects.filter((s) => !criteria.subjects.includes(s));
    const subjRatio =
      familySubjects.length > 0 ? matchedSubjects.length / familySubjects.length : 1;
    const subjectPoints = Math.round(subjRatio * 30);
    if (familySubjects.length > 0 && matchedSubjects.length === 0) {
      hardMismatchReasons.push('None of the kids subjects covered');
    }
    checks.push({
      label: 'Kids Subjects',
      ok: missingSubjects.length === 0,
      detail:
        missingSubjects.length === 0
          ? `Covers all ${matchedSubjects.length} subjects`
          : `${matchedSubjects.length}/${familySubjects.length} covered (missing: ${missingSubjects
              .map((id) => subjMap.get(id) || id)
              .join(', ')})`,
    });

    // 3. Days, Slots & Hours per Day (20 pts)
    const familyDays = Array.from(new Set(parent.kids.flatMap((k) => k.selectedDays)));
    const familySlots = Array.from(
      new Set(parent.kids.flatMap((k) => [...k.weekdaySlots, ...k.weekendSlots]))
    );
    const familyMaxHours = parent.kids.reduce((m, k) => Math.max(m, Number(k.hoursPerDay || 1)), 1);

    const matchedDays =
      criteria.selectedDays.length === 0
        ? familyDays
        : familyDays.filter((d) => criteria.selectedDays.includes(d));
    const dayRatio = familyDays.length > 0 ? matchedDays.length / familyDays.length : 1;
    const dayScore = Math.round(dayRatio * 10);
    if (criteria.selectedDays.length > 0 && familyDays.length > 0 && matchedDays.length === 0) {
      hardMismatchReasons.push('No overlapping days');
    }

    const tutorSlots = [...criteria.weekdaySlots, ...criteria.weekendSlots];
    const matchedSlots =
      tutorSlots.length === 0 ? familySlots : familySlots.filter((s) => tutorSlots.includes(s));
    const slotScore =
      tutorSlots.length === 0 || familySlots.length === 0
        ? 6
        : Math.round((matchedSlots.length / familySlots.length) * 6);

    const tutorHours = criteria.hoursPerDay === 'any' ? 3 : Number(criteria.hoursPerDay);
    const hoursOk = tutorHours >= familyMaxHours;
    const hoursScore = hoursOk ? 4 : 1;
    const daysCountOk = criteria.daysPerWeek === 0 || criteria.daysPerWeek >= familyDays.length;

    checks.push({
      label: 'Schedule Fit',
      ok:
        matchedDays.length === familyDays.length &&
        (tutorSlots.length === 0 || matchedSlots.length === familySlots.length) &&
        hoursOk &&
        daysCountOk,
      detail: `${matchedDays.length}/${familyDays.length} days · Family wants ${familyMaxHours} hr/day`,
    });

    // 4. Budget Alignment (15 pts)
    const feeOk = tutorFeeFitsParentAppBudget(
      criteria.expectedFeePerHour,
      parent.parentProfile.expectedPaymentPerHour
    );
    if (!feeOk) {
      hardMismatchReasons.push('Parent budget below 600+ ETB/hr');
    }
    const feePoints = feeOk ? 15 : 4;
    checks.push({
      label: 'Budget Match',
      ok: feeOk,
      detail:
        parent.parentProfile.expectedPaymentPerHour === '600_700_efficiency'
          ? 'Budget 600–700 ETB/hr'
          : parent.parentProfile.expectedPaymentPerHour === 'max_600'
          ? 'Max 600 ETB/hr'
          : '400–500 ETB/hr',
    });

    // 5. Sex Preference & Grade Level Fit (10 pts)
    const parentSexPref = parent.tutorPreference.sex || 'any';
    const sexOk = parentSexPref === 'any' || parentSexPref === criteria.sex;
    if (!sexOk) {
      hardMismatchReasons.push(`Family prefers ${parentSexPref} tutor`);
    }
    const sexPoints = sexOk ? 5 : 0;

    const kidGrades = parent.kids.map((k) => k.gradeLevel).filter(Boolean);
    const gradeCheck = eduFitsGrades(criteria.educationLevel, kidGrades);
    if (!gradeCheck.ok) hardMismatchReasons.push(gradeCheck.detail);
    const gradePoints = gradeCheck.ok ? 5 : 0;

    checks.push({
      label: 'Sex & Kid Grades',
      ok: sexOk && gradeCheck.ok,
      detail: `${parent.kids.length} kid(s): ${kidGrades
        .map((id) => gradeMap.get(id) || id)
        .join(', ')}`,
    });

    const rawScore =
      locPoints + subjectPoints + dayScore + slotScore + hoursScore + feePoints + sexPoints + gradePoints;
    const score = Math.max(
      0,
      Math.min(100, hardMismatchReasons.length > 0 ? Math.min(rawScore, 69) : rawScore)
    );

    const tier: RankedParentMatch['tier'] =
      score >= 90 && hardMismatchReasons.length === 0
        ? 'perfect'
        : score >= 75 && hardMismatchReasons.length === 0
        ? 'strong'
        : 'partial';

    return {
      parent,
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

  return ranked.sort((a, b) => {
    const aHard = a.hardMismatchReasons.length === 0 ? 0 : 1;
    const bHard = b.hardMismatchReasons.length === 0 ? 0 : 1;
    if (aHard !== bHard) return aHard - bHard;
    return b.score - a.score;
  });
}
