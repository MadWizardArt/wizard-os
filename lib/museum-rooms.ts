import type { MuseId } from "./museum";

type MuseRoomPresentation = {
  name: string;
  description: string;
  image: string;
  animatedImage?: string;
};

// Presentation only: room artwork never represents agent activity.
export const MUSE_ROOMS: Record<MuseId, MuseRoomPresentation> = {
  novy: {
    name: "The Observatory",
    description: "Candlelight, constellations and connected ideas.",
    image: "/museum/novy.webp",
    animatedImage: "https://d2jqrm6oza8nb6.cloudfront.net/datasets/ec2708d4-1ad6-4ccf-ad39-72482469835c.gif?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiYjNlODNiYTM5MjViMGQxZiIsImJ1Y2tldCI6InJ1bndheS1kYXRhc2V0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc4OTY0Njg4M30._vHA7sEwT5kIwWXUczfK2IMEm_i39yZFnLKSdml1laA",
  },
  callista: { name: "The Strategy Chamber", description: "A quiet desk for consequential decisions.", image: "/museum/callista.webp" },
  aurelia: { name: "The Golden Atelier", description: "Paint, linen and the art of the almost-right.", image: "/museum/aurelia.webp" },
  lyra: { name: "The Recording Studio", description: "Stories find their rhythm here.", image: "/museum/lyra.webp" },
  cleo: { name: "The Grand Archive", description: "A place for every record, and its history.", image: "/museum/cleo.webp" },
  melina: { name: "The Sentinel’s Study", description: "Clear questions in a room of quiet shadows.", image: "/museum/melina.webp" },
  seraphine: {
    name: "The Contemplative Library",
    description: "Room to read, reflect and find the meaning.",
    image: "/museum/seraphine.webp",
    animatedImage: "https://d2jqrm6oza8nb6.cloudfront.net/datasets/5df781a5-e635-46b5-b69c-46c0cba4980e.gif?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiOGZkM2Q2MmM3ODM4Nzg5YSIsImJ1Y2tldCI6InJ1bndheS1kYXRhc2V0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc4OTY0ODgxMn0.V9ZYYZ7pF31m37lQ0G3BOGYxGrMsfFOoCN49k6MidoY",
  },
  tessa: { name: "The Living Studio", description: "Good light, useful space and a livable plan.", image: "/museum/tessa.webp" },
  thalia: { name: "The Workshop of Possibilities", description: "Leave a little room for the unexpected.", image: "/museum/thalia.webp" },
};
