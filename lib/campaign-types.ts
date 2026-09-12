export type Task = {
  id: string;
  campaignId: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  category: string;
  completed: boolean;
};
export type Painting = {
  projectId: string;
  project: { id: string; title: string };
  thumbnail: string;
  dimensions: string;
  medium: string;
  framing: string;
  availability: string;
  regularPriceCents: number | null;
  batchId: string | null;
};
export type Content = {
  id: string;
  campaignId: string;
  title: string;
  text: string;
  postingDate: string;
  status: string;
};
export type Batch = {
  id: string;
  campaignId: string;
  title: string;
  plannedQuantity: number;
  weeklyQuantity: number;
  unitPriceCents: number;
  startDate: string;
  completionDate: string;
  _count: { paintings: number };
};
export type Campaign = {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  targetCents: number;
  receivedCents: number;
  notes: string;
  projectId: string | null;
  project: { id: string; title: string } | null;
  tasks: Task[];
  artwork: {
    projectId: string;
    salePriceCents: number | null;
    painting: Painting;
  }[];
  content: Content[];
  batches: Batch[];
};
export type Goal = {
  id: string;
  targetCents: number;
  receivedCents: number;
  startDate: string;
  dueDate: string;
  basis: string;
  excludeSalesTax: boolean;
  excludeShipping: boolean;
};
export type SalesData = {
  campaigns: Campaign[];
  paintings: Painting[];
  projects: { id: string; title: string; valueCents: number | null }[];
  transactions: {
    id: string;
    type: string;
    amountCents: number;
    salesTaxCents: number;
    shippingCents: number;
    receivedAt: string | null;
    isNonArt: boolean;
    isArtworkReceipt: boolean;
    source: string;
    projectId: string | null;
    campaignId: string | null;
  }[];
  goal: Goal;
  initialized: boolean;
  priorWorkOrders: { id: string; title: string; notes: string | null }[];
};
