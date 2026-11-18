import type { Playlist } from "../types/playlist";

export type MusicFolder = { id: string; name: string; parent?: string };
export const musicFolders: MusicFolder[] = [
  {id:"latino",name:"LATINO"},
  {id:"cumbia",name:"Cumbia",parent:"latino"},
  {id:"salsa",name:"Salsa",parent:"latino"},
  {id:"merengue",name:"Merengue",parent:"latino"},
  {id:"bachata",name:"Bachata",parent:"latino"},
  {id:"regional",name:"Regional / Rancheras",parent:"latino"},
  {id:"urbano",name:"URBANO LATINO"},
  {id:"reggaeton",name:"Reggaeton",parent:"urbano"},
  {id:"hip-rnb",name:"HIP HOP & R&B"},
  {id:"hiphop",name:"Hip Hop",parent:"hip-rnb"},
  {id:"rnb",name:"R&B",parent:"hip-rnb"},
  {id:"crossover",name:"Crossover",parent:"hip-rnb"},
  {id:"electronica",name:"ELECTRÓNICA"},
  {id:"house",name:"House",parent:"electronica"},
  {id:"techno",name:"Techno",parent:"electronica"},
  {id:"decadas",name:"DÉCADAS"},
  {id:"sesiones",name:"SESIONES / MIXTAPES"},
  {id:"otras",name:"OTRAS"},
  {id:"auxiliares",name:"ARCHIVOS AUXILIARES"},
];
const prefix = "__folder__";
export function folderPlaylistId(id:string) { return prefix + id; }
export function folderFromPlaylistId(id?:string) {
  return id?.startsWith(prefix) ? musicFolders.find(f=>prefix+f.id===id) : undefined;
}
function key(name:string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
}
export function playlistFolder(p:Playlist):string {
  const n=key(p.name);
  if (/__FILTERED_|__OUT_OF_RANGE|__UNKNOWN_DATE/.test(n)) return "auxiliares";
  if (n.includes("MIXTAPE")) return "sesiones";
  if (n.includes("REGGAETON")) return "reggaeton";
  if (n.includes("CUMBIA") || n.includes("PACHANGA")) return "cumbia";
  if (n.includes("SALSA")) return "salsa";
  if (n.includes("MERENGUE")) return "merengue";
  if (n.includes("BACHATA")) return "bachata";
  if (n.includes("RANCHERA") || n.includes("REGIONAL")) return "regional";
  if (n.includes("RAP R&B")) return "crossover";
  if (n.includes("HIP HOP")) return "hiphop";
  if (n.includes("R&B")) return "rnb";
  if (n.includes("HOUSE")) return "house";
  if (n.includes("TECHNO")) return "techno";
  if (/^(?:19|20)?[0-9]0S$/.test(n)) return "decadas";
  return "otras";
}
export function descendantFolderIds(id:string):Set<string> {
  const result=new Set<string>();
  function visit(current:string) {
    if(result.has(current)) return;
    result.add(current);
    musicFolders.filter(f=>f.parent===current).forEach(f=>visit(f.id));
  }
  visit(id); return result;
}
export function folderMembers(id:string, playlists:Playlist[]):Playlist[] {
  const ids=descendantFolderIds(id);
  return playlists.filter(p=>ids.has(playlistFolder(p)));
}
export function resolveFolderPlaylist(id:string|undefined, playlists:Playlist[]):Playlist|undefined {
  const folder=folderFromPlaylistId(id);
  if(!folder) return playlists.find(p=>p.id===id);
  const members=folderMembers(folder.id,playlists);
  return {
    id:folderPlaylistId(folder.id),name:folder.name,
    description:"Todas las canciones de esta carpeta y sus subcarpetas.",
    category:"Carpeta",updatedAt:"",trackIds:Array.from(new Set(members.flatMap(p=>p.trackIds))),
  };
}
