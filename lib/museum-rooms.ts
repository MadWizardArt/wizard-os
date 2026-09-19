import type { MuseId } from "./museum";

type MuseRoomPresentation = {
  name: string;
  description: string;
  image: string;
  animatedImage?: string;
  animatedVideo?: string;
};

// Presentation only: room artwork never represents agent activity.
export const MUSE_ROOMS: Record<MuseId, MuseRoomPresentation> = {
  novy: {
    name: "The Observatory",
    description: "Candlelight, constellations and connected ideas.",
    image: "/museum/novy.webp",
    animatedVideo: "/museum/novy-room.webm",
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
    animatedVideo: "/museum/seraphine-room.webm",
  },
  tessa: { name: "The Living Studio", description: "Good light, useful space and a livable plan.", image: "/museum/tessa.webp" },
  thalia: { name: "The Workshop of Possibilities", description: "Leave a little room for the unexpected.", image: "/museum/thalia.webp" },
};
