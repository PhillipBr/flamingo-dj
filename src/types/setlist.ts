export type CurrentSetItem = {
  trackId: string;
  plannedPlaySeconds: number;
  addedAt: string;
};

export type CurrentSet = {
  id: string;
  name: string;
  items: CurrentSetItem[];
  createdAt: string;
  updatedAt: string;
};