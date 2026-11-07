/**
 * Types definition for GELORA 26 - Lomba Literasi & Numerasi SMPN 26 Sijunjung
 */

export type UserRole = 'admin' | 'student';

export type StageId = 'penyisihan' | 'top30' | 'semifinal' | 'final';

export type QuestionType = 
  | 'pg_single'     // Pilihan Ganda 1 jawaban benar
  | 'pg_complex'    // Pilihan Ganda Kompleks (2 atau 3 jawaban benar)
  | 'true_false'    // Benar atau Salah
  | 'matching';     // Menjodohkan

export interface TrueFalseStatement {
  id: string;
  statement: string;
  correctAnswer: boolean; // true = Benar, false = Salah
}

export interface MatchingPair {
  id: string;
  premise: string; // Sisi Kiri
  response: string; // Sisi Kanan yang benar
}

export interface Question {
  id: string;
  stageId: StageId;
  order: number;
  type: QuestionType;
  category: 'literasi' | 'numerasi';
  stimulusText: string;
  imageUrl?: string;
  questionPrompt: string;
  points: number; // Skor per soal diatur panitia
  // For 'pg_single' and 'pg_complex'
  options?: { id: string; text: string }[];
  correctOptionIds?: string[]; // 1 id for single, 2-3 ids for complex
  // For 'true_false'
  trueFalseStatements?: TrueFalseStatement[];
  // For 'matching'
  matchingPairs?: MatchingPair[];
}

export interface Student {
  id: string;
  noPeserta: string;
  nama: string;
  sekolah: string;
  kelas: string;
  pin: string;
  avatar?: string;
  qualifiedStage: StageId; // Babak tertinggi yang diikuti / lolos
  status: 'aktif' | 'lolos' | 'gugur' | 'selesai';
}

export interface StageConfig {
  id: StageId;
  name: string;
  subtitle: string;
  description: string;
  isActive: boolean; // Apakah babak ini sedang diaktifkan panitia
  maxDurationMinutes: number;
  passingQuota: number; // e.g. 30 untuk penyisihan, 10 untuk 30 besar, 3/5 untuk semifinal
}

export interface AnswerSubmission {
  id: string;
  studentId: string;
  stageId: StageId;
  questionId: string;
  type: QuestionType;
  // Answer format depending on type:
  // pg_single: string (optionId)
  // pg_complex: string[] (optionIds)
  // true_false: Record<statementId, boolean>
  // matching: Record<premiseId, string>
  answer: any;
  isCorrect: boolean;
  scoreEarned: number;
  submittedAt: number;
}

export interface StudentProgress {
  studentId: string;
  stageId: StageId;
  completedQuestionIds: string[];
  totalScore: number;
  isFinished: boolean;
  finishedAt?: number;
}

export interface LeaderboardRank {
  rank: number;
  studentId: string;
  noPeserta: string;
  nama: string;
  sekolah: string;
  totalScore: number;
  totalAnswered: number;
  correctCount: number;
  lastSubmitTime?: number;
}

export interface AppDatabaseState {
  stages: Record<StageId, StageConfig>;
  students: Student[];
  questions: Question[];
  submissions: AnswerSubmission[];
  studentProgress: Record<string, StudentProgress>; // key: `${studentId}_${stageId}`
  adminPassword: string;
  activeStageId: StageId;
  announcement?: string;
}
