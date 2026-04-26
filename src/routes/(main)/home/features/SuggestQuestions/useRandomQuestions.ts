import { useCallback, useState } from 'react';

import { type StarterMode } from '@/store/home';

const QUESTION_COUNTS = {
  agent: 40,
  chat: 3,
  group: 40,
  write: 40,
} as const;

const DISPLAY_COUNTS = {
  agent: 6,
  chat: 3,
  group: 6,
  write: 6,
} as const;

type SuggestQuestionMode = keyof typeof QUESTION_COUNTS;

const isSuggestQuestionMode = (mode: string): mode is SuggestQuestionMode =>
  mode in QUESTION_COUNTS;

export type QuestionMode = SuggestQuestionMode;

const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const generateQuestions = (mode: QuestionMode | StarterMode = 'chat') => {
  const modeKey = mode ?? 'chat';

  if (!isSuggestQuestionMode(modeKey)) {
    return [];
  }

  const ids = Array.from({ length: QUESTION_COUNTS[modeKey] }, (_, i) => i + 1);
  const shuffled = shuffleArray(ids);
  return shuffled.slice(0, DISPLAY_COUNTS[modeKey]).map((id) => ({
    id,
    promptKey: `${modeKey}.${String(id).padStart(2, '0')}.prompt`,
    titleKey: `${modeKey}.${String(id).padStart(2, '0')}.title`,
  }));
};

export interface QuestionItem {
  id: number;
  promptKey: string;
  titleKey: string;
}

interface UseRandomQuestionsResult {
  questions: QuestionItem[];
  refresh: () => void;
}

export const useRandomQuestions = (
  mode: QuestionMode | StarterMode = 'chat',
): UseRandomQuestionsResult => {
  const [questions, setQuestions] = useState<QuestionItem[]>(() => generateQuestions(mode));

  const refresh = useCallback(() => {
    setQuestions(generateQuestions(mode));
  }, [mode]);

  return { questions, refresh };
};
