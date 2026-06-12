import { createContext, useContext, useState, type ReactNode } from 'react';
import type { RequirementField } from './types';
import type { ZoneStyle } from './types';

export interface Candidate {
  id: string;
  name: string;
  variant: 'grid' | 'stacked' | 'wide' | 'minimal';
  wireframeId?: string;
  description: string;
  strategy: string;
  styles: {
    primaryColor: string;
    fontFamily: string;
    borderRadius?: string;
    shadow?: string;
    gradient?: string;
    accentRotation?: string;
    logo?: string | null;
  };
  elements: {
    headline: boolean;
    price: boolean;
    image: boolean;
    cta: boolean;
    logo: boolean;
  };
  suggestedZoneStyles?: Record<string, ZoneStyle>;
}

interface TemplateBuilderContextValue {
  requirements: RequirementField[];
  feedSampleData: Array<Record<string, unknown>>;
  feedColumns: string[];
  candidates: Candidate[];
  setRequirements: (r: RequirementField[]) => void;
  setFeedSample: (data: Array<Record<string, unknown>>, columns: string[]) => void;
  setCandidates: (c: Candidate[]) => void;
}

const TemplateBuilderContext = createContext<TemplateBuilderContextValue>({
  requirements: [],
  feedSampleData: [],
  feedColumns: [],
  candidates: [],
  setRequirements: () => {},
  setFeedSample: () => {},
  setCandidates: () => {},
});

export function TemplateBuilderProvider({ children }: { children: ReactNode }) {
  const [requirements, setRequirements] = useState<RequirementField[]>([]);
  const [feedSampleData, setFeedSampleData] = useState<Array<Record<string, unknown>>>([]);
  const [feedColumns, setFeedColumns] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const setFeedSample = (data: Array<Record<string, unknown>>, columns: string[]) => {
    setFeedSampleData(data);
    setFeedColumns(columns);
  };

  return (
    <TemplateBuilderContext.Provider value={{
      requirements, feedSampleData, feedColumns, candidates,
      setRequirements, setFeedSample, setCandidates,
    }}>
      {children}
    </TemplateBuilderContext.Provider>
  );
}

export function useTemplateBuilder(): TemplateBuilderContextValue {
  return useContext(TemplateBuilderContext);
}
