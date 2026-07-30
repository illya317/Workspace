export type NewsItemKind = "featured" | "brief";
export type NewsReactionKind = "like" | "dislike";
export type NewsFeedFreshness = "fresh" | "unavailable";

export interface NewsItem {
  itemKey: string;
  reportId: string;
  kind: NewsItemKind;
  title: string;
  url: string | null;
  source: string;
  summary: string;
  tags: string[];
  score: number | null;
}

export interface NewsBriefing {
  reportId: string;
  title: string;
  generatedAt: string | null;
  sourceUrl: string;
  freshness: NewsFeedFreshness;
  items: NewsItem[];
  reactions: Record<string, NewsReactionKind>;
  message?: string;
}

export interface NewsWorkspaceDto {
  briefing: NewsBriefing;
}
