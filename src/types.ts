export interface TermObject {
  slug:                  string
  title:                 string
  blockquote_definition: string
  extended_definition?:  string
  related_terms:         RelatedTerm[]
  sources:               Source[]
  first_used?:           string
  pillar?:               'How We Think' | 'What We Observe' | "What We've Learned"
}

export interface RelatedTerm {
  slug:         string
  title:        string
  relationship: string
  direction:    'outbound' | 'inbound'
  url:          string
}

export interface Source {
  type:                  'blog_article' | 'lexicon_entry' | 'github' | 'wiki' | 'podcast'
  title:                 string
  url:                   string
  reading_order:         number
  relevance:             'CRITICAL' | 'HIGH' | 'SUPPORTING'
  reading_time_minutes?: number
}

export interface AlignmentResult {
  detected_term:    string
  arco_equivalent:  string
  canonical_url:    string
  alignment_score:  number
  verdict:          'ALIGNED' | 'PARTIALLY_ALIGNED' | 'NEEDS_CLARIFICATION' | 'MISALIGNED'
  note:             string
  suggested_reframe?: string
}
