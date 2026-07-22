/**
 * The opportunity/workshop catalog — static app content (like the
 * achievement catalog or quiz questions), shared between the Explore tab
 * (app/(tabs)/opportunities.tsx) and the Public Profile Workshops tab.
 * Participation in these is real, per-user Firestore data — see
 * services/workshopService.ts and types/Workshop.ts — only the catalog
 * entries themselves are static.
 */
export type Opportunity = {
  id: string; name: string; organisation: string; category: string;
  location: string; ageRange: string; cost: "Free" | "Subsidised" | "Paid";
  description: string; highlights: string[];
  contact?: string; website?: string; mapsQuery?: string;
};

export const OPPORTUNITIES: Opportunity[] = [
  { id: "1", name: "Youth Photography Workshop", organisation: "Tel Aviv Museum of Art", category: "Photography", location: "Tel Aviv", ageRange: "14–18", cost: "Subsidised", description: "A 10-week photography programme covering composition, lighting, and digital editing. Participants display their work in a final group exhibition.", highlights: ["Weekly 2h sessions", "Camera equipment provided", "Final exhibition"], contact: "education@tamuseum.org.il", website: "https://www.tamuseum.org.il", mapsQuery: "Tel Aviv Museum of Art, Tel Aviv" },
  { id: "2", name: "Maktoob Youth Coding Bootcamp", organisation: "Maktoob / Google.org", category: "Coding", location: "Ramallah / Online", ageRange: "15–18", cost: "Free", description: "Intensive coding bootcamp teaching web development and entrepreneurship skills to Palestinian youth. Includes mentorship from tech professionals.", highlights: ["12-week programme", "Mentorship included", "Certificate on completion"], website: "https://www.maktoob.org" },
  { id: "3", name: "Football for Peace Academy", organisation: "Peres Center for Peace", category: "Sports", location: "Various cities (IL/PA)", ageRange: "13–17", cost: "Free", description: "Mixed Israeli and Palestinian football teams train together to build teamwork, leadership, and coexistence skills through sport.", highlights: ["Co-ed and mixed teams", "Free kit provided", "Regional tournaments"], contact: "youth@peres-center.org" },
  { id: "4", name: "Al-Kamandjati Music School", organisation: "Al-Kamandjati", category: "Music", location: "Ramallah / Dheisheh", ageRange: "13–18", cost: "Free", description: "Provides classical and Arabic music education to Palestinian youth, offering individual lessons, ensembles, and concerts.", highlights: ["Classical & Arabic music", "Instrument loans available", "Annual concerts"], website: "https://www.al-kamandjati.com", mapsQuery: "Al-Kamandjati Ramallah" },
  { id: "5", name: "Young Creators Art Studio", organisation: "Jerusalem Open House for Art", category: "Drawing & Art", location: "Jerusalem", ageRange: "14–18", cost: "Subsidised", description: "Bi-weekly studio sessions in painting, drawing, and mixed-media art. Students exhibit work at the end of each semester.", highlights: ["Materials provided", "Bi-weekly sessions", "Semester exhibition"], contact: "studio@joha.org.il", mapsQuery: "Jerusalem Open House for Art" },
  { id: "6", name: "Teen Film Lab", organisation: "Jerusalem Sam Spiegel Film School", category: "Film & Video", location: "Jerusalem", ageRange: "14–18", cost: "Subsidised", description: "A semester-long programme where teens write, direct, and edit their own short films. Equipment and editing suites are provided.", highlights: ["Camera & editing suite access", "Mentored by film students", "Showcase screening"], website: "https://www.jsfs.co.il", mapsQuery: "Sam Spiegel Film School Jerusalem" },
  { id: "7", name: "Surf Club Youth Programme", organisation: "Israel Surf Association", category: "Sports", location: "Tel Aviv Beach", ageRange: "13–18", cost: "Subsidised", description: "Learn-to-surf and intermediate sessions on Tel Aviv beach every weekend. Board and wetsuit rental included in the registration fee.", highlights: ["Weekend morning sessions", "Equipment included", "Safety certification"], contact: "youth@israelsurf.org.il", mapsQuery: "Tel Aviv Beach, Tel Aviv" },
  { id: "8", name: "Dance Fusion Workshop", organisation: "Vertigo Dance Company", category: "Dance", location: "Kibbutz Netiv HaLamed Heh", ageRange: "15–18", cost: "Subsidised", description: "Explore contemporary, hip-hop, and traditional dance forms with professional dancers. Summer and winter intensive options available.", highlights: ["Multi-style training", "Residential option", "Performance showcase"], website: "https://www.vertigo.org.il" },
  { id: "9", name: "Kitchen Explorers Cooking Club", organisation: "Arab-Jewish Community Centre Jaffa", category: "Cooking", location: "Jaffa / Tel Aviv", ageRange: "13–17", cost: "Free", description: "Bi-weekly cooking sessions exploring Mediterranean, Middle Eastern, and fusion cuisine. All ingredients provided.", highlights: ["All ingredients provided", "Bi-weekly sessions", "Cultural exchange focus"], contact: "community@ajccjaffa.org", mapsQuery: "Arab-Jewish Community Centre Jaffa" },
  { id: "10", name: "e-Sports and Game Design Camp", organisation: "Mifras Youth Tech Hub", category: "Gaming", location: "Haifa", ageRange: "13–18", cost: "Paid", description: "Multi-day camp covering competitive e-sports, basic game design in Unity, and streaming. Scholarships available for families with financial need.", highlights: ["Unity game design", "Streaming & content creation", "Scholarships available"], contact: "info@mifras.co.il", mapsQuery: "Haifa, Israel" },
  { id: "11", name: "Young Writers Circle", organisation: "Tamer Institute for Community Education", category: "Reading", location: "Ramallah / Gaza", ageRange: "13–18", cost: "Free", description: "A monthly workshop for youth interested in creative writing, poetry, and storytelling in Arabic. Works are published in the institute's youth magazine.", highlights: ["Arabic creative writing", "Monthly sessions", "Published in youth magazine"], website: "https://www.tamerinst.org" },
  { id: "12", name: "Robotics & STEM Club", organisation: "FIRST Israel / ORT Network", category: "Coding", location: "Multiple cities (IL)", ageRange: "14–18", cost: "Subsidised", description: "Join a FIRST Robotics team to build and compete with a robot at regional and international competitions.", highlights: ["International competitions", "Mentored by engineers", "ORT school network"], website: "https://www.firstisrael.org.il" },
];

export function opportunityById(id: string): Opportunity | undefined {
  return OPPORTUNITIES.find((o) => o.id === id);
}
